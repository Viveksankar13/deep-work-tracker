import os
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"
import cv2
import numpy as np
import base64
import time
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from collections import deque
from contextlib import asynccontextmanager

import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

detector = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global detector
    print("Deep Work Tracker: Initializing MediaPipe Tasks API...")
    try:
        model_path = 'face_detector.tflite'
        if not os.path.exists(model_path):
             print(f"ERROR: Model file not found at {os.path.abspath(model_path)}")
        base_options = python.BaseOptions(model_asset_path=model_path)
        options = vision.FaceDetectorOptions(base_options=base_options, min_detection_confidence=0.3)
        detector = vision.FaceDetector.create_from_options(options)
        print("SUCCESS: MediaPipe FaceDetector initialized")
    except Exception as e:
        print(f"ERROR: Failed to initialize MediaPipe FaceDetector: {e}")
        detector = None
    
    yield
    
    if detector is not None:
        try:
            detector.close()
            print("SUCCESS: MediaPipe FaceDetector closed cleanly")
        except Exception as e:
            print(f"Error closing detector: {e}")

app = FastAPI(lifespan=lifespan)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {
        "status": "online",
        "message": "Deep Work Tracker API is running",
        "websocket_endpoint": "/ws/detect"
    }

@app.get("/favicon.ico")
async def favicon():
    from fastapi.responses import Response
    return Response(status_code=204)


# Session State
class SessionState:
    def __init__(self):
        self.is_running = False
        self.start_time = None
        self.accumulated_focus_time = 0
        self.accumulated_break_time = 0
        self.last_state_change_time = time.time()
        self.last_detection_time = time.time()
        self.session_duration = 60 * 60  # 60 minutes
        self.first_start_time = None
        self.is_finished = False
        
    def start(self):
        if self.is_finished:
            print("DEBUG: Session is finished. Reset required.")
            return # Don't start if finished
            
        now = time.time()
        if not self.is_running:
            # If we were previously stopped/on break, record that break time
            if self.first_start_time is not None:
                self.accumulated_break_time += now - self.last_state_change_time
            
            if self.first_start_time is None:
                self.first_start_time = now
            
            self.is_running = True
            self.start_time = now
            self.last_state_change_time = now

    def stop(self):
        now = time.time()
        if self.is_running:
            self.is_running = False
            if self.start_time:
                self.accumulated_focus_time += now - self.start_time
                self.start_time = None
            self.last_state_change_time = now

    def get_elapsed_time(self):
        elapsed = self.accumulated_focus_time
        if self.is_running and self.start_time:
            elapsed += time.time() - self.start_time
        return elapsed

    def get_break_time(self):
        break_time = self.accumulated_break_time
        if not self.is_running and self.first_start_time is not None and not self.is_finished:
            break_time += time.time() - self.last_state_change_time
        return max(0, break_time)

    def finish(self):
        now = time.time()
        if not self.is_finished:
            if self.is_running:
                self.stop()
            else:
                if self.first_start_time is not None:
                    self.accumulated_break_time += now - self.last_state_change_time
            self.is_finished = True

    def reset(self):
        self.is_running = False
        self.start_time = None
        self.accumulated_focus_time = 0
        self.accumulated_break_time = 0
        self.last_state_change_time = time.time()
        self.last_detection_time = time.time()
        self.first_start_time = None
        self.is_finished = False

# Session and Motivation Setup
session = SessionState()

async def generate_motivation():
    import random
    messages = [
        "Outstanding job! Your focus remained completely unbroken.",
        "Excellent work! You've successfully completed your deep work session.",
        "Fantastic session! Your dedication and focus are paying off.",
        "Mission accomplished! Incredible concentration today.",
        "Great job! You stayed locked in for the entire session. Keep it up!",
        "Superb focus! You are making great progress.",
        "Session complete! Your discipline is inspiring."
    ]
    return random.choice(messages)

async def process_frame(frame_data):
    try:
        # Decode base64 image
        header, encoded = frame_data.split(",", 1)
        img_bytes = base64.b64decode(encoded)
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            print("ERROR: Failed to decode image")
            return False
        
        if detector is None:
            return False

        # MediaPipe requires RGB and its own Image format
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=img_rgb)
        
        # Process detection
        results = detector.detect(mp_image)
        
        detected = results.detections is not None and len(results.detections) > 0
        if detected:
            print(f"DEBUG: Detection SUCCESS ({len(results.detections)} faces)")
        return detected
    except Exception as e:
        print(f"Error processing frame: {e}")
        return False

@app.websocket("/ws/detect")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("Client connected")
    
    ai_message = ""
    
    try:
        frame_count = 0
        while True:
            data = await websocket.receive_text()
            frame_count += 1
            if frame_count % 10 == 0:
                print(f"DEBUG: Processing frame {frame_count} (Present: {session.is_running})")
            
            # Simple command handling
            if data == "RESET":
                session.reset()
                ai_message = ""
                await websocket.send_json({
                    "status": "RESET",
                    "present": False,
                    "running": False,
                    "elapsed": 0,
                    "breakTime": 0,
                    "remaining": session.session_duration,
                    "duration": session.session_duration,
                    "completed": False,
                    "aiMessage": ""
                })
                continue
            
            if data == "END_SESSION":
                session.finish()
                await websocket.send_json({
                    "present": False,
                    "running": False,
                    "elapsed": session.get_elapsed_time(),
                    "breakTime": session.get_break_time(),
                    "remaining": 0, # Force 'done' state visually ? or just Stopped.
                    "duration": session.session_duration,
                    "completed": True, # Treat manual end as completion for summary purposes?
                    "aiMessage": "Session ended manually. Good work today!" 
                })
                continue

            if session.is_finished:
                await websocket.send_json({
                    "present": False,
                    "running": False,
                    "elapsed": session.get_elapsed_time(),
                    "breakTime": session.get_break_time(),
                    "remaining": 0,
                    "duration": session.session_duration,
                    "completed": True,
                    "aiMessage": ai_message or "Session finished."
                })
                continue

            is_present = await process_frame(data)
            
            if is_present:
                session.last_detection_time = time.time()
                if not session.is_running:
                    session.start()
                    print("User returned - starting timer")
            else:
                # If user is gone for more than 10 seconds, pause
                if time.time() - session.last_detection_time > 10:
                    if session.is_running:
                        session.stop()
                        print("User left - pausing timer")
            
            elapsed = session.get_elapsed_time()
            break_time = session.get_break_time()
            remaining = max(0, session.session_duration - elapsed)
            is_completed = remaining == 0
            
            if frame_count % 10 == 0:
                print(f"DEBUG: State -> Present: {is_present}, Running: {session.is_running}, Elapsed: {elapsed:.1f}s")
            
            if is_completed:
                session.finish()
                if not ai_message:
                     # Generate message only once
                     ai_message = await generate_motivation()
            
            await websocket.send_json({
                "present": is_present, 
                "running": session.is_running,
                "elapsed": elapsed,
                "breakTime": break_time,
                "remaining": remaining,
                "duration": session.session_duration,
                "completed": is_completed or session.is_finished,
                "aiMessage": ai_message
            })
            
    except WebSocketDisconnect:
        print("Client disconnected")
        session.stop()
    except Exception as e:
        print(f"Error: {e}")
        session.stop()
