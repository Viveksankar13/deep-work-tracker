'use client';

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import Webcam from 'react-webcam';
import {
    RefreshCw, LogOut, CheckCircle, Clock,
    TrendingUp, Activity, Wifi, WifiOff, Eye, EyeOff,
    Terminal, AlertCircle, ShieldAlert
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);
// -- Center Text Plugin for Doughnut Chart ------------------------------------
const centerTextPlugin = {
    id: 'centerText',
    afterDraw(chart: any) {
        const opts = (chart.options?.plugins as any)?.centerText;
        if (!opts) return;
        const { ctx, chartArea: { top, left, width, height } } = chart;
        const cx = left + width / 2;
        const cy = top + height / 2;
        ctx.save();
        ctx.letterSpacing = '0px';

        if (opts.completed) {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#34d399';
            ctx.font = 'bold 12px Inter, system-ui, sans-serif';
            ctx.fillText('COMPLETE', cx, cy);
        } else {
            const statusText = opts.running ? 'FOCUSING' : 'STANDBY';
            const timerText = opts.timerText || '60:00';
            const effText = opts.effText || '0% eff.';
            const radius = Math.min(width, height) / 2;
            const lineGap = Math.max(14, radius * 0.18);

            // Status label
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = opts.running ? 'rgba(165,180,252,1)' : 'rgba(251,191,36,1)';
            ctx.font = `bold ${Math.max(8, radius * 0.11)}px Inter, system-ui, sans-serif`;
            ctx.fillText(statusText, cx, cy - lineGap);

            // Timer
            ctx.fillStyle = '#ffffff';
            ctx.font = `bold ${Math.max(16, radius * 0.26)}px ui-monospace, monospace`;
            ctx.fillText(timerText, cx, cy + 2);

            // Efficiency
            ctx.fillStyle = 'rgba(148,163,184,0.9)';
            ctx.font = `600 ${Math.max(8, radius * 0.11)}px ui-monospace, monospace`;
            ctx.fillText(effText, cx, cy + lineGap + 4);
        }

        ctx.restore();
    }
};
ChartJS.register(centerTextPlugin);

function cn(...inputs: any[]) { return twMerge(clsx(inputs)); }

interface TrackerState {
    present: boolean;
    running: boolean;
    elapsed: number;
    remaining: number;
    duration?: number;
    completed: boolean;
    aiMessage?: string;
    breakTime?: number;
}

const WEBSOCKET_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/ws/detect';
const TOTAL_DURATION = 60 * 60; // 60 minutes

// Formatter utility
function formatDuration(totalSeconds: number) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// ── Metric Bar Component ──────────────────────────────────────────────────────
interface MetricBarProps {
    label: string;
    value: string;
    percent: number;
    colorClass: string;
}

function MetricBar({ label, value, percent, colorClass }: MetricBarProps) {
    return (
        <div className="metric-row w-full">
            <div className="flex justify-between items-center text-xs font-semibold">
                <span className="text-slate-400 tracking-wide">{label}</span>
                <span className="text-slate-200 font-mono">{value}</span>
            </div>
            <div className="progress-bar-base w-full">
                <div
                    className={cn("progress-bar-fill-inner", colorClass)}
                    style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
                />
            </div>
        </div>
    );
}



// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function DeepWorkTracker() {
    const webcamRef = useRef<Webcam>(null);
    const [ws, setWs] = useState<WebSocket | null>(null);
    const [state, setState] = useState<TrackerState>({
        present: false,
        running: false,
        elapsed: 0,
        remaining: TOTAL_DURATION,
        duration: TOTAL_DURATION,
        completed: false,
        aiMessage: '',
        breakTime: 0
    });
    const [connected, setConnected] = useState(false);
    const [alertMessage, setAlertMessage] = useState<string | null>(null);
    const [systemLogs, setSystemLogs] = useState<string[]>([]);

    // Unique Session Identifier
    const [sessionId, setSessionId] = useState('');

    useEffect(() => {
        setSessionId(`SES-${Math.random().toString(36).substring(2, 8).toUpperCase()}`);
    }, []);

    // Helper to log system events
    const logEvent = useCallback((message: string) => {
        const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
        setSystemLogs(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 20)]);
    }, []);

    // Initialize WebSocket Connection
    useEffect(() => {
        logEvent("Initializing network connection...");
        const socket = new WebSocket(WEBSOCKET_URL);

        socket.onopen = () => {
            logEvent("WebSocket session connected successfully.");
            setConnected(true);
        };

        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.status === 'RESET') {
                logEvent("Session reset command received.");
                setState({
                    present: false,
                    running: false,
                    elapsed: 0,
                    remaining: TOTAL_DURATION,
                    duration: TOTAL_DURATION,
                    completed: false,
                    aiMessage: '',
                    breakTime: 0
                });
                setAlertMessage(null);
            } else {
                setState(prevState => {
                    // Log transition states
                    if (data.present !== prevState.present) {
                        logEvent(data.present ? "User entered workspace frame." : "User left workspace frame.");
                    }
                    if (data.running !== prevState.running) {
                        logEvent(data.running ? "Focus timer started." : "Focus timer paused.");
                    }
                    if (data.completed && !prevState.completed) {
                        logEvent("Focus block completed successfully.");
                    }

                    // Trigger alert if there's a new AI feedback message
                    if (data.aiMessage && data.aiMessage !== prevState.aiMessage) {
                        setAlertMessage(data.aiMessage);
                    }

                    return data;
                });
            }
        };

        socket.onclose = () => {
            logEvent("WebSocket connection closed.");
            setConnected(false);
        };

        setWs(socket);

        return () => {
            socket.close();
        };
    }, [logEvent]);

    // Webcam frames Web Worker
    useEffect(() => {
        if (!connected || !ws || state.completed) return;

        const workerBlob = new Blob([`
            let interval = null;
            self.onmessage = function(e) {
                if (e.data === 'start') {
                    interval = setInterval(() => self.postMessage('tick'), 500);
                } else if (e.data === 'stop') {
                    clearInterval(interval);
                }
            };
        `], { type: 'application/javascript' });

        const worker = new Worker(URL.createObjectURL(workerBlob));

        worker.onmessage = () => {
            if (webcamRef.current) {
                const imageSrc = webcamRef.current.getScreenshot();
                if (imageSrc && ws.readyState === WebSocket.OPEN) {
                    ws.send(imageSrc);
                }
            }
        };

        worker.postMessage('start');
        logEvent("Deep learning analytical frame capture worker initialized.");

        return () => {
            worker.postMessage('stop');
            worker.terminate();
        };
    }, [connected, ws, logEvent, state.completed]);

    const handleReset = useCallback(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send('RESET');
        }
    }, [ws]);

    const handleEndSession = useCallback(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send('END_SESSION');
        }
    }, [ws]);

    // Data points & charts setup
    const elapsed = state.elapsed || 0;
    const breakTime = state.breakTime || 0;
    const totalActivity = elapsed + breakTime;
    const focusRatio = totalActivity > 0 ? (elapsed / totalActivity) * 100 : 0;
    const breakRatio = totalActivity > 0 ? (breakTime / totalActivity) * 100 : 0;
    const duration = state.duration || TOTAL_DURATION;
    const sessionProgress = Math.max(0, Math.min(100, ((duration - state.remaining) / duration) * 100));

    const chartData = useMemo(() => ({
        labels: ['Focus Time', 'Break Time'],
        datasets: [
            {
                data: [Math.max(0.1, elapsed), Math.max(0.1, breakTime)],
                backgroundColor: ['#6366f1', 'rgba(99, 102, 241, 0.2)'],
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.05)',
                hoverBackgroundColor: ['#4f46e5', 'rgba(99, 102, 241, 0.3)'],
            },
        ],
    }), [elapsed, breakTime]);

    return (
        <div className="relative h-screen w-full bg-[#080d1a] flex flex-col overflow-hidden font-sans">

            {/* Soft Ambient Background Orbs container to prevent scrolling overflow */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute top-[-100px] left-[-100px] ambient-glow-purple" />
                <div className="absolute bottom-[-100px] right-[-100px] ambient-glow-cyan" />
            </div>

            {/* ── Corporate Dashboard Header ──────────────────────────────────────── */}
            <header className="relative z-10 w-full border-b border-slate-800 bg-[#0c1222]/80 backdrop-blur-md px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div>
                        <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                            Deep Work Tracker <span className="text-[10px] bg-indigo-500/20 text-indigo-300 font-semibold px-2 py-0.5 rounded-full border border-indigo-500/30"></span>
                        </h1>
                    </div>
                </div>

                <div className="flex items-center gap-4 flex-wrap sm:flex-nowrap">
                    {/* Session ID badge */}
                    <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800">
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Session Key</span>
                        <span className="text-xs font-mono font-semibold text-slate-300">{sessionId}</span>
                    </div>

                    {/* Network Connection Pill */}
                    <div className={cn(
                        "status-pill",
                        connected ? "status-pill-running" : "status-pill-danger"
                    )}>
                        {connected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                        <span>{connected ? "Cognitive State Analysis Console" : "No Service Signal"}</span>
                        <span className={cn(
                            "w-1.5 h-.5 rounded-full",
                            connected ? "bg-indigo-400 animate-pulse" : "bg-rose-400"
                        )} />
                    </div>
                </div>
            </header>

            {/* ── Main Workspace Grid ─────────────────────────────────────────────── */}
            <main className="relative z-10 flex-1 min-h-0 w-full max-w-7xl mx-auto px-6 py-5 overflow-hidden" style={{ display: "grid", gridTemplateColumns: "7fr 5fr", gap: "20px" }}>

                {/* Left Panel: Video Analysis and Real-Time Feedback */}
                <div className="flex flex-col gap-4 min-h-0 overflow-y-auto">

                    {/* Webcam analysis card */}
                    <div className="dashboard-card overflow-hidden flex flex-col">
                        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Eye className="w-4 h-4 text-indigo-400" />
                                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Live Biometric Feed</span>
                            </div>

                            {/* User status badge */}
                            <div className="flex items-center gap-2">
                                <span className={state.present ? "status-dot-active" : "status-dot-idle"} />
                                <span className="text-xs font-semibold text-slate-300">
                                    {state.present ? "Operator Detected" : "Operator Away"}
                                </span>
                            </div>
                        </div>

                        {/* Webcam Viewport */}
                        <div className="relative w-full aspect-video bg-[#050811] flex items-center justify-center">
                            <Webcam
                                audio={false}
                                ref={webcamRef}
                                screenshotFormat="image/jpeg"
                                className="w-full h-full object-cover"
                                forceScreenshotSourceSize={true}
                                mirrored={true}
                                videoConstraints={{
                                    width: 640,
                                    height: 360,
                                    facingMode: "user"
                                }}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />

                            {/* Finished Session Overlay */}
                            {state.completed && (
                                <div className="absolute inset-0 flex items-center justify-center bg-slate-950/90 backdrop-blur-md z-20 transition-all">
                                    <div className="text-center p-6 max-w-sm flex flex-col items-center">
                                        <div className="bg-indigo-500/10 p-4 rounded-full border border-indigo-500/20 mb-4">
                                            <CheckCircle className="w-12 h-12 text-indigo-400" />
                                        </div>
                                        <h3 className="text-lg font-bold text-white mb-2">Block Cycle Completed</h3>
                                        <p className="text-xs text-slate-400 leading-relaxed italic mb-4">
                                            "{state.aiMessage || 'Analytical process finished. Take a scheduled recovery break.'}"
                                        </p>
                                        <div className="flex gap-2">
                                            <span className="px-3 py-1 rounded bg-slate-900 text-slate-300 text-[10px] font-mono border border-slate-800">
                                                Focus: {formatDuration(elapsed)}
                                            </span>
                                            <span className="px-3 py-1 rounded bg-slate-900 text-slate-300 text-[10px] font-mono border border-slate-800">
                                                Break: {formatDuration(breakTime)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* AI Feedback Banner */}
                    {alertMessage && (
                        <div className="flex items-start gap-3 p-4 rounded-xl bg-indigo-950/20 border border-indigo-500/20 shadow-md">
                            <div className="p-1 bg-indigo-500/10 rounded-lg text-indigo-400 mt-0.5">
                                <Activity className="w-4 h-4" />
                            </div>
                            <div>
                                <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-wider mb-0.5">AI Engine Intelligence Message</h4>
                                <p className="text-xs text-slate-300 leading-relaxed">
                                    {alertMessage}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Terminal System logs */}
                    <div className="dashboard-card flex flex-col">
                        <div className="px-4 py-2.5 border-b border-slate-800 flex items-center gap-2">
                            <Terminal className="w-4 h-4 text-slate-400" />
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">System Event Journal</span>
                        </div>
                        <div className="p-3 font-mono text-[10px] text-slate-400 overflow-y-auto flex flex-col gap-1 h-[75px]">
                            {systemLogs.length === 0 ? (
                                <span className="text-slate-600 italic">No events logged yet.</span>
                            ) : (
                                systemLogs.map((log, idx) => (
                                    <div key={idx} className="flex items-start gap-2">
                                        <span className="text-indigo-500">▶</span>
                                        <span>{log}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Panel: Focus Ring and Live Metric Reports */}
                <div className="flex flex-col gap-4 min-h-0 overflow-y-auto">

                    {/* Unified Focus Cycle & Allocation Analytics Card */}
                    <div className="dashboard-card flex flex-col">
                        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider font-sans">Focus Allocation & Cycle Analytics</span>
                            <div className={cn(
                                "status-pill",
                                state.completed ? "status-pill-success" : state.running ? "status-pill-running" : "status-pill-warning"
                            )}>
                                {state.completed ? "Complete" : state.running ? "Focus Phase" : "Standby"}
                            </div>
                        </div>

                        <div className="p-4 flex flex-col gap-4">
                            {/* Doughnut Chart — center text drawn by canvas plugin */}
                            <div className="flex flex-col items-center justify-center">
                                <div style={{ width: '100%', maxWidth: '200px' }}>
                                    <Doughnut
                                        data={chartData}
                                        options={{
                                            maintainAspectRatio: true,
                                            responsive: true,
                                            cutout: '68%',
                                            animation: { duration: 400 },
                                            plugins: {
                                                legend: { display: false },
                                                tooltip: {
                                                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                                                    titleColor: '#94a3b8',
                                                    bodyColor: '#e2e8f0',
                                                    borderWidth: 1,
                                                    borderColor: 'rgba(255, 255, 255, 0.08)',
                                                    callbacks: {
                                                        label: (context: any) => ` ${Math.round(context.raw as number)}s`
                                                    }
                                                },
                                                centerText: {
                                                    running: state.running,
                                                    completed: state.completed,
                                                    timerText: formatDuration(state.remaining),
                                                    effText: `${Math.round(focusRatio)}% eff.`,
                                                }
                                            } as any
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Chart legend mapping & quick metrics */}
                            <div className="grid grid-cols-2 gap-4 bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
                                <div className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-sm bg-indigo-500" />
                                    <div className="flex flex-col">
                                        <span className="text-[10px] text-slate-500 font-bold uppercase">Focus Time</span>
                                        <span className="text-xs font-mono font-semibold text-slate-200">{formatDuration(elapsed)}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 border-l border-slate-800/80 pl-4">
                                    <div className="w-2.5 h-2.5 rounded-sm bg-indigo-500/20 border border-indigo-500/30" />
                                    <div className="flex flex-col">
                                        <span className="text-[10px] text-slate-500 font-bold uppercase">Rest Buffer</span>
                                        <span className="text-xs font-mono font-semibold text-slate-200">{formatDuration(breakTime)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Gauges rows */}
                            <div className="flex flex-col gap-4 mt-1 border-t border-slate-800/60 pt-4">
                                <MetricBar
                                    label="COGNITIVE FOCUS RATIO"
                                    value={`${Math.round(focusRatio)}%`}
                                    percent={focusRatio}
                                    colorClass="bg-indigo-500"
                                />
                                <MetricBar
                                    label="REST AND RECOVERY BUFFER"
                                    value={`${Math.round(breakRatio)}%`}
                                    percent={breakRatio}
                                    colorClass="bg-slate-700"
                                />
                                <MetricBar
                                    label="SESSION COMPLETION RATE"
                                    value={`${Math.round(sessionProgress)}%`}
                                    percent={sessionProgress}
                                    colorClass="bg-emerald-500"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Control Panel Buttons */}
                    <div className="flex items-center gap-3">
                        <button
                            id="btn-reset"
                            onClick={handleReset}
                            className="btn-saas btn-saas-secondary flex-1"
                            title="Reset entire timer metrics"
                        >
                            <RefreshCw className="w-4 h-4 text-slate-400" />
                            <span>Reset Block</span>
                        </button>
                        <button
                            id="btn-end-session"
                            onClick={handleEndSession}
                            className="btn-saas btn-saas-danger flex-[1.4]"
                            title="Terminate current focus cycle"
                        >
                            <LogOut className="w-4 h-4" />
                            <span>End Session</span>
                        </button>
                    </div>

                </div>
            </main>

            {/* Footer Bar */}
            <footer className="relative z-10 w-full px-6 py-3 border-t border-slate-800/80 bg-[#0c1222]/30 flex flex-col sm:flex-row items-center justify-between text-[10px] font-medium text-slate-500 tracking-wider uppercase gap-2">
                <span className="flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-indigo-500" /> Enterprise Flow Analytics Core
                </span>
            </footer>
        </div>
    );
}
