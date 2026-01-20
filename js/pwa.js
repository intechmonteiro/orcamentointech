// -------- js/pwa.js --------

export function configurarPWAInstall() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./service-worker.js")
      .then(() => {
        console.log("PWA registrado!");
      })
      .catch(err => {
        console.error("Erro ao registrar PWA:", err);
      });
  });
}
