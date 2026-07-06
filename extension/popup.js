const BASE_URL = "https://income-compass-belgium.lovable.app";

document.querySelectorAll("button[data-path]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const path = btn.getAttribute("data-path") || "/";
    chrome.tabs.create({ url: BASE_URL + path });
    window.close();
  });
});
