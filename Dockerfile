# Stage 1: Build the app
FROM node:14 as builder

WORKDIR ./

COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Create a lightweight image with only necessary files
FROM node:14-alpine

WORKDIR ./

COPY package*.json ./
RUN npm install --only=production

# Copy built app from the previous stage
COPY --from=builder ./dist ./dist

# Specify the command to run your app when the container starts
CMD ["node", "./dist/app.js"]
