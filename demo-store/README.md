# Hannes & Co. demo store

The static storefront used to demo the AI support widget. It is the open-source
"ecommerce-store" template by **Aditya Chakravorty** (MIT License, see `LICENSE` in this folder),
a fictitious clothing shop.

## What was changed for this project

- Added `src/js/chat-loader.js` and one `<script>` tag on every page. It loads the chat widget from the support server.
- Fixed the background image path in `src/css/main.css` so it works from any folder.

Nothing else in the template was changed. Product photos and brand logos are placeholders for the demo only.

## Run it

Open `index.html` in a browser, or serve the folder (`npx serve .`).
To point the widget at your deployed server, edit `API` in `src/js/chat-loader.js`.
