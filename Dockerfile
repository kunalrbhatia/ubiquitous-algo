# Use an official Node.js runtime as the base image
FROM node:14

# Set the working directory inside the container
WORKDIR ./

# Copy package.json and package-lock.json to the container's working directory
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application's source code to the container's working directory
COPY . .

# Build your React app (replace 'build' with your actual build command)
RUN npm run build

# Specify the command to run your app when the container starts
CMD ["npm", "start"]


# -------------------------------- BELOW DOCKER SCRIPT TO USE WHEN EVERYTHING IS STABLE


# Stage 1: Build the app
# FROM node:14 as builder

# WORKDIR ./

# COPY package*.json ./
# RUN npm install
# COPY . .
# RUN npm run build

# Stage 2: Create a lightweight image with only necessary files
# FROM node:14-alpine

# WORKDIR ./

# COPY package*.json ./
# RUN npm install --only=production

# Copy built app from the previous stage
# COPY --from=builder ./dist ./dist

# Specify the command to run your app when the container starts
# CMD ["node", "./dist/app.js"]
