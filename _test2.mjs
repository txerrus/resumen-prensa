import Parser from "rss-parser";
const parser = new Parser({ timeout: 12000, headers: { "User-Agent": "Mozilla/5.0 ResumenPrensa/0.3" } });
const C = {
  "Local/Madrid": {
    "El Mundo": "https://e00-elmundo.uecdn.es/elmundo/rss/madrid.xml",
    "20minutos": "https://www.20minutos.es/rss/madrid/",
    "ABC": "https://www.abc.es/rss/2.0/madrid/",
    "El País": "https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/espana/madrid/portada",
    "La Vanguardia": "https://www.lavanguardia.com/rss/madrid.xml",
  },
  "Tecnología": {
    "El País": "https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/tecnologia/portada",
    "El Mundo": "https://e00-elmundo.uecdn.es/elmundo/rss/tecnologia.xml",
    "La Vanguardia": "https://www.lavanguardia.com/rss/tecnologia.xml",
    "20minutos": "https://www.20minutos.es/rss/tecnologia/",
    "elDiario.es": "https://www.eldiario.es/rss/tecnologia/",
  },
  "Ciencia": {
    "El País": "https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/ciencia/portada",
    "El Mundo": "https://e00-elmundo.uecdn.es/elmundo/rss/ciencia.xml",
    "La Vanguardia": "https://www.lavanguardia.com/rss/ciencia.xml",
    "20minutos": "https://www.20minutos.es/rss/ciencia/",
  },
  "Salud": {
    "El País": "https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/sociedad/salud/portada",
    "El Mundo": "https://e00-elmundo.uecdn.es/elmundosalud/rss/portada.xml",
    "La Vanguardia": "https://www.lavanguardia.com/rss/vida/salud.xml",
    "20minutos": "https://www.20minutos.es/rss/salud/",
    "elDiario.es": "https://www.eldiario.es/rss/sociedad/salud/",
  },
};
for (const [sec, feeds] of Object.entries(C)) {
  console.log("\n### " + sec);
  for (const [medio, url] of Object.entries(feeds)) {
    try { const f = await parser.parseURL(url);
      console.log(`  OK  ${medio.padEnd(14)} ${(f.items?.length||0).toString().padStart(3)}  <- ${url}`);
    } catch (e) { console.log(`  XX  ${medio.padEnd(14)}  ${e.message}  <- ${url}`); }
  }
}
