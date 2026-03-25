node server.js &
SERVER_PID=$!
sleep 5
echo "copying..."
cp /app/my_staging_file.dae /app/Showroom/staging/face_frame.dae 2>/dev/null || true
echo "<?xml version='1.0'?><COLLADA/>" > /app/Showroom/staging/my_showroom_file.dae
sleep 5
echo "Directory contents:"
ls -la /app/Showroom/staging
kill $SERVER_PID
