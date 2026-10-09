// Loads the AI support chat widget on every page.
// Change API when you deploy the server (no trailing slash).
const API = "http://localhost:5000";

const s = document.createElement("script");
s.src = API + "/widget.js";
s.dataset.api = API;
s.dataset.title = "Hannes & Co. Support";
s.defer = true;
document.body.appendChild(s);
