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
    // If Turndown is not resolving correctly, you might need an alias
    // alias: {
    //   'turndown': path.resolve(__dirname, 'node_modules/turndown/lib/turndown.es.js') // Or wherever the ES module entry is
    // }
  },
  module: {
    rules: [
      // You might need babel-loader if you use very modern JS features
      // not supported by your target Chrome version
    ],
  },
};
