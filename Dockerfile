# Step 1: Use an official Node.js runtime as a parent image
FROM node:20-alpine as build

# Step 2: Set the working directory inside the container
WORKDIR /app

# Step 3: Copy the package.json and package-lock.json files
COPY package*.json ./

# Step 4: Install the dependencies
RUN npm install

# Step 5: Copy the rest of the application code
COPY . .

# Step 6: Build the React app
RUN npm run build

# Step 7: Use an official Nginx image to serve the built app
FROM nginx:stable-alpine

# Step 8: Copy the build output to Nginx's web directory
COPY --from=build /app/build /usr/share/nginx/html

# Step 9: Copy the Nginx configuration file
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Step 10: Expose the port that Nginx will run on
EXPOSE 80

# Step 11: Start Nginx when the container starts
CMD ["nginx", "-g", "daemon off;"]
