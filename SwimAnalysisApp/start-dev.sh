#!/bin/bash
cd "$(dirname "$0")"
echo "Starting Expo Dev Server..."
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"
npx expo start
