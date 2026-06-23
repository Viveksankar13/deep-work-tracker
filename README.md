# Deep Work Tracker

## Prerequisites
1. **Python 3.10+**
2. **Node.js 18+**
3. **Webcam**

## Setup

### Backend (Python)
1. Navigate to `backend`:
   ```bash
   cd backend
   ```
2. create virtual env (optional)
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Run the server:
   ```bash
   uvicorn main:app --reload
   ```

### Frontend (Next.js)
1. Navigate to `frontend`:
   ```bash
   cd frontend
   ```
2. Install dependencies (if not done):
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```

## Usage
1. Open `http://localhost:3000`.
2. Allow camera access.
3. Sit in view. Timer starts.
4. Leave view. Timer pauses.
5. Provide continuous presence for 60 minutes to complete the session.
