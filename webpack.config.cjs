const path = require("path");

module.exports = {
  mode: "production", // or 'development' for easier debugging
  entry: {
    pageInteraction: "./pageInteraction.js", // Your main content script
    // Add other entries if needed, e.g., options: './options.js'
  },
  output: {
    path: path.resolve(__dirname, "dist"), // Output to a 'dist' folder
    filename: "[name].bundle.js",
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname), // Alias for root directory to ensure correct module resolution
    },
    fallback: {
      "fs": false,
      "path": false,
      "os": false
    }
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env']
          }
        }
      }
    ],
  },
};
