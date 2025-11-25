#!/bin/bash

# AIgoGen Project Page - Local Server Starter
# 启动本地HTTP服务器以查看项目页面

PORT=8080
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=========================================="
echo "AIgoGen Project Page Server"
echo "=========================================="
echo ""
echo "Starting server at: http://localhost:$PORT"
echo "Project directory: $PROJECT_DIR"
echo ""
echo "Press Ctrl+C to stop the server"
echo "=========================================="
echo ""

cd "$PROJECT_DIR"

# 检查Python3是否可用
if command -v python3 &> /dev/null; then
    echo "Using Python3 HTTP server..."
    python3 -m http.server $PORT
elif command -v python &> /dev/null; then
    echo "Using Python HTTP server..."
    python -m SimpleHTTPServer $PORT
elif command -v npx &> /dev/null; then
    echo "Using Node.js http-server..."
    npx http-server -p $PORT
elif command -v php &> /dev/null; then
    echo "Using PHP built-in server..."
    php -S localhost:$PORT
else
    echo "Error: No suitable HTTP server found!"
    echo "Please install Python3, Node.js (npx), or PHP to run the server."
    exit 1
fi
