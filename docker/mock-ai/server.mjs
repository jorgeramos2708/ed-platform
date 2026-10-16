// mock-ai: servidor OpenAI-compatible de DESARROLLO — planes canned para probar el flujo M2
// completo sin una API key real. NO es parte del producto: fixture de compose.dev.
// MOCK_FALLOS_INICIALES: las primeras N peticiones responden 429 (para probar el failover S5).
import http from 'node:http';

let peticiones = 0;
const fallos = Number(process.env.MOCK_FALLOS_INICIALES ?? 0);

http
  .createServer((req, res) => {
    if (req.method === 'POST' && req.url.includes('/chat/completions')) {
      let cuerpo = '';
      req.on('data', (c) => (cuerpo += c));
      req.on('end', () => {
        peticiones++;
        if (peticiones <= fallos) {
          res.writeHead(429, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'mock: cuota simulada' } }));
          return;
        }
        let instruccion = '';
        try {
          const solicitud = JSON.parse(cuerpo);
          instruccion = solicitud.messages?.at(-1)?.content ?? '';
        } catch { /* cuerpo ilegible: instruccion vacía */ }
        const plan = {
          titulo: 'plan del mock-ai (dev)',
          pasos: [
            {
              accion: 'editar',
              archivo: 'salida-ia.txt',
              contenido: `generado por mock-ai para: ${instruccion.slice(0, 100)}`,
            },
            { accion: 'comando', comando: 'cat salida-ia.txt' },
          ],
        };
        const contenido = '```json\n' + JSON.stringify(plan) + '\n```';
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            choices: [{ message: { content: contenido } }],
            usage: { prompt_tokens: 100, completion_tokens: 50 },
          }),
        );
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  })
  .listen(80);
