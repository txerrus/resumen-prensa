// Tema claro/oscuro: aplica el guardado (o el del sistema) y activa los botones [data-tema].
(function(){
  var raiz=document.documentElement;
  try{var t=localStorage.getItem("rp_tema"); if(t==="light"||t==="dark") raiz.dataset.theme=t;}catch(e){}
  function oscuroAhora(){
    return raiz.dataset.theme ? raiz.dataset.theme==="dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function pintar(){
    document.querySelectorAll("[data-tema]").forEach(function(b){
      var o=oscuroAhora();
      b.setAttribute("aria-label",o?"Usar tema claro":"Usar tema oscuro");
      b.title=b.getAttribute("aria-label");
      b.innerHTML=o
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
    });
  }
  document.addEventListener("DOMContentLoaded",function(){
    pintar();
    document.querySelectorAll("[data-tema]").forEach(function(b){
      b.addEventListener("click",function(){
        var nuevo=oscuroAhora()?"light":"dark";
        raiz.dataset.theme=nuevo;
        try{localStorage.setItem("rp_tema",nuevo);}catch(e){}
        pintar();
      });
    });
  });
})();
