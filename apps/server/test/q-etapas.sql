SELECT c.id, LEFT(c."pipelinePath", 30) AS pipeline,
       LEFT(e.salida, 150) AS salida_etapa
FROM corridas_ci c
LEFT JOIN corrida_etapas e ON e."corridaId" = c.id
ORDER BY c."iniciadoEn" DESC NULLS LAST LIMIT 6;
