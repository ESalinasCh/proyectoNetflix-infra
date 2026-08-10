# Resumen Two‑Tower sobre MovieLens

## Introducción

Este trabajo presenta la implementación y evaluación de un sistema de recomendación basado en un modelo Two‑Tower entrenado sobre el dataset MovieLens 20M. El objetivo es aprender vectores de ítem y vectores de consulta (queries) que permitan recuperar, de forma eficiente, los ítems más relevantes para un perfil de usuario a partir de su historial de visualizaciones. El código fuente y los experimentos están en `ml/notebooks/two_tower_movielens.ipynb`.

## Dataset y preprocesado

- **Fuente:** MovieLens 20M (ratings.csv, movies.csv).
- **Feedback implícito:** Se considera una interacción positiva si rating ≥ 4.0; el resto se descarta.
- **Filtrado:** Se eliminan ítems con menos de MIN_ITEM_POS positivos y usuarios con menos de MIN_USER_POS positivos para asegurar señal suficiente.
- **Reindexado:** Los ítems se reindexan a 1..N y 0 se reserva como PAD para rellenar historiales.
- **Secuencias:** Las interacciones por usuario se ordenan cronológicamente; se extraen historiales de longitud hasta MAX_HIST para cada muestra entrenamiento.

## Protocolo experimental

- **Split:** Leave‑one‑out cronológico por usuario: última interacción → test, penúltima → validación, resto → entrenamiento.
- **Métricas:** recall@K y nDCG@K para K ∈ {10, 20, 50, 100}, calculadas rankeando el ítem objetivo contra todo el catálogo y enmascarando ítems ya vistos.
- **Baseline:** Ranking por popularidad (most‑popular) calculado solo sobre la porción de entrenamiento; se reporta lift relativo.

## Construcción del dataset de entrenamiento

- Para cada usuario se muestrean hasta PAIRS_PER_USER posiciones temporales dentro del tramo de entrenamiento. Cada par es (historial, target) donde el historial contiene las MAX_HIST interacciones previas, paddeadas con 0 a la izquierda.
- El dataset se empaqueta en batches de tamaño fijo (BATCH) y se usa `tf.data` para entrenamiento eficiente. El softmax in‑batch requiere batches de tamaño fijo porque los negativos son los targets de otras filas del lote.

## Modelo Two‑Tower

- **Arquitectura:**
  - Tabla de embeddings compartida de ítems (size = num_items + 1).
  - Torre de ítem: embedding → Dense(HIDDEN, relu) → Dense(DIM) → L2‑norm.
  - Torre de query: promedio (masking PAD) de embeddings del historial → Dense(HIDDEN, relu) → Dense(DIM) → L2‑norm.
- Las salidas están L2‑normalizadas; la similitud se calcula por producto punto y se escala por `temperature`.
- Comentario de diseño: promediar historial (en lugar de usar embedding por user_id) generaliza a perfiles fuera del conjunto de usuarios de MovieLens.

## Entrenamiento y pérdida

- **Pérdida:** softmax muestreado in‑batch.
- **Corrección logQ:** resta del logaritmo de la probabilidad de muestreo basada en frecuencia de ítem.
- **Accidental hits:** si el mismo ítem aparece como target en varias filas del lote, esos logits se anulan (−1e9).
- **Optimización:** Adam con tasa LR; callback `ValRecall` calcula recall@10 sobre validación al final de cada época y guarda los mejores pesos.

## Evaluación final y exportación

- Se calculan vectores de ítem (`item_vectors`) y vectores de consulta para el conjunto de test y se obtienen recall@K y nDCG@K. Se compara con baseline most‑popular.
- Se exportan artefactos listos para producción: `item_vectors.f32`, `pool_embeddings.f32`, `query_tower.json`, `catalog.json`, `metrics.json`.
- Los artefactos se empaquetan en `two_tower_artifacts.zip` para descarga y subida a S3; la notebook incluye instrucciones para sincronizar con el bucket del stack CloudFormation desde el contenedor `toolbox`.

## Resultados y discusión

- Las métricas finales están en `metrics.json`. El Two‑Tower típicamente supera la baseline por popularidad en recall y nDCG, mostrando que el modelo captura señales de relevancia personalizadas.
- Limitaciones: no se modelan secuencias complejas (solo promedio), ni se usan metadatos/texto.

## Conclusiones y trabajo futuro

- Pipeline reproducible: preprocesado → entrenamiento → evaluación → exportación de artefactos.
- Extensiones: modelos de secuencia, features multimodales, cold‑start y distillation para latencia.
