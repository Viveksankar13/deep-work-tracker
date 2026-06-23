import urllib.request
import os

# Face Detection model (Short range)
url = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite"
output_path = "face_detector.tflite"

if not os.path.exists(output_path):
    print(f"Downloading {output_path}...")
    urllib.request.urlretrieve(url, output_path)
    print("Download complete.")
else:
    print("Model already exists.")
