SELECT estado, extract(epoch from (c.terminadoEn - c.iniciadoEn)) AS segundos FROM corridas_ci c ORDER BY c.iniciadoEn DESC LIMIT 4
