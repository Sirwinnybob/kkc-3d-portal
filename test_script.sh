node server.js &
SERVER_PID=$!
sleep 5
echo "copying..."
cp /app/Showroom/staging/my_staging_file.dae /app/Showroom/staging/my_second_staging_file.dae
sleep 5
echo "Directory contents:"
ls -la /app/Showroom/staging
kill $SERVER_PID
