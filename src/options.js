const field = document.getElementById("auto-clear");
const status = document.getElementById("status");
chrome.storage.sync.get({ autoClearSeconds: 1 }).then(({ autoClearSeconds }) => {
  field.value = String(autoClearSeconds);
});
field.addEventListener("change", async () => {
  await chrome.storage.sync.set({ autoClearSeconds: Number(field.value) });
  status.textContent = "Saved";
});
