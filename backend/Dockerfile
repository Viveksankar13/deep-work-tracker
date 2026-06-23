# Use an official lightweight Python image
FROM python:3.10-slim

# Install system dependencies required by OpenCV and MediaPipe
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libgles2-mesa \
    libgles2-mesa-dev \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory in the container
WORKDIR /app

# Copy the requirements file and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the backend files
COPY . .

# Expose the port uvicorn will run on
EXPOSE 10000

# Set environment variables
ENV PORT=10000

# Start the uvicorn server
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port $PORT"]
