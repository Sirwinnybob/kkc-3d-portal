node server.js &
SERVER_PID=$!
sleep 3
mkdir -p /app/Showroom/staging/face_frame
echo "dummy glb" > /app/Showroom/staging/face_frame/my_file.glb
curl -s http://localhost:5021/api/showroom/staging
kill $SERVER_PID
