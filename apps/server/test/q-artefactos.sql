SELECT etiqueta, "rutaRelativa" AS ruta, digest, octet_length(contenido) AS bytes
FROM artefactos;
SELECT a.etiqueta, a.digest, octet_length(a.contenido) AS bytes
FROM artefactos a JOIN corridas_ci c ON c.id = a."corridaId"
WHERE c."commitSha" = '19c92f222a644acb464a45029ce202dcc06a24e5';
