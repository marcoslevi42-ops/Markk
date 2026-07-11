# Imagen oficial de Playwright: trae Chromium y todas sus dependencias
# de sistema, así el conector a siHosp funciona sin instalación extra.
FROM mcr.microsoft.com/playwright:v1.61.1-noble

WORKDIR /app

# El navegador ya viene en la imagen: evitamos que npm lo re-descargue.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts

COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server.js"]
