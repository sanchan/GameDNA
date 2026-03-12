# Analisis del Estado Actual de GameDNA

## Resumen

Proyecto de ~9,400 lineas de TypeScript, bien estructurado con separacion clara (server/client/shared). La mayoria de las features del plan original estan implementadas. Las areas principales de mejora son: robustez del backend, feedback de usuario en el frontend, y features que quedaron incompletas.

---

## 1. Mejoras Tecnicas

### 1.1 Base de Datos

| Prioridad | Mejora | Detalle |
|-----------|--------|---------|
| **Alta** | ~~Agregar indices en FK~~ | ~~`user_games(user_id)`, `swipe_history(user_id)`, `recommendations(user_id, score)` — sin estos, queries con muchos juegos hacen full table scan~~ **DONE** |
| **Alta** | ~~Unificar definicion de schema~~ | ~~Hay schema duplicado: Drizzle `schema.ts` y SQL raw en `db/index.ts`. Pueden divergir silenciosamente. Usar solo Drizzle push~~ **DONE** |
| **Media** | ~~Limpieza de sesiones expiradas~~ | ~~Las sesiones expiradas nunca se borran de la DB. Agregar cleanup periodico (ej. al iniciar el servidor o cada 24h)~~ **DONE** |
| **Media** | ~~Paginacion en library/wishlist~~ | ~~`lists.ts` endpoints devuelven TODOS los juegos sin paginar — problematico con bibliotecas de 1000+ juegos~~ **DONE** |
| **Baja** | ~~Hacer configurable el cache TTL~~ | ~~El threshold de 7 dias en `game-cache.ts:6` esta hardcodeado. Un env var lo haria ajustable~~ **DONE** |

### 1.2 Sync y Background Tasks

| Prioridad | Mejora | Detalle |
|-----------|--------|---------|
| **Alta** | ~~Timeout para sync~~ | ~~`user.ts:70` — el sync de fondo no tiene timeout, puede quedar colgado indefinidamente~~ **DONE** |
| **Alta** | ~~Estado de sync persistente~~ | ~~`sync-manager.ts` guarda estado en memoria — se pierde al reiniciar el server. Persistir en SQLite~~ **DONE** |
| **Media** | ~~Limpieza del sync manager~~ | ~~El mapa de estados crece indefinidamente con cada usuario nuevo, sin cleanup~~ **DONE** |
| **Media** | ~~Retry con backoff exponencial~~ | ~~`game-cache.ts` no tiene retry — si un fetch falla, el juego queda sin cachear~~ **DONE** |

### 1.3 Calidad de Codigo

| Prioridad | Mejora | Detalle |
|-----------|--------|---------|
| **Media** | ~~Extraer magic numbers a config~~ | ~~Pesos del scoring (`0.4/0.3/0.2/0.1`), batch sizes (`3`, `10`), thresholds — estan hardcodeados en multiples archivos~~ **DONE** |
| **Media** | ~~Rate limiter consistente~~ | ~~`steam-api.ts` — wishlist no usa rate limiter, y `getAppDetails` hace 2 requests pero solo adquiere 1 token~~ **DONE** |
| **Baja** | Agregar Vitest | No hay test framework. Funciones criticas como `taste-profile.ts` y `recommendation.ts` se beneficiarian de unit tests |
| **Baja** | ~~Request timeout en api client~~ | ~~`client/src/lib/api.ts` no tiene timeout ni retry — requests colgados bloquean la UI sin feedback~~ **DONE** |

### 1.4 Seguridad (nivel local)

| Prioridad | Mejora | Detalle |
|-----------|--------|---------|
| **Media** | ~~Validar JSON parsing de Ollama~~ | ~~`ollama.ts:30` — `generateJSON()` no valida el JSON. Si Ollama devuelve texto malformado, crashea~~ **DONE** |
| **Baja** | ~~Sanitizar LIKE queries~~ | ~~`history.ts:51` — el search usa LIKE directo. Aunque es SQLite local, caracteres como `%` y `_` no se escapan~~ **DONE** |

---

## 2. Mejoras de UX

### 2.1 Feedback al Usuario

| Prioridad | Mejora | Detalle |
|-----------|--------|---------|
| **Alta** | ~~Toast de confirmacion en swipes~~ | ~~Al swipear un juego, la carta desaparece sin feedback. Un toast breve ("Added to Yes list") confirmaria la accion~~ **DONE** |
| **Alta** | ~~Toast en acciones de bookmark~~ | ~~Agregar/quitar bookmark es silencioso — el usuario no sabe si funciono~~ **DONE** |
| **Alta** | ~~Errores visibles al usuario~~ | ~~Muchos errores van solo a console.log. Los errores de API deberian mostrarse como toast de error~~ **DONE** |
| **Media** | ~~Animacion del toast~~ | ~~`Toast.tsx` referencia `animate-slide-up` pero la animacion CSS no funciona correctamente~~ **DONE** |

### 2.2 Estados y Loading

| Prioridad | Mejora | Detalle |
|-----------|--------|---------|
| **Alta** | ~~Mensaje claro durante sync~~ | ~~El skeleton durante sync no explica que esta pasando. Mostrar "Syncing your Steam library..." con progreso~~ **DONE** |
| **Media** | ~~Empty state con next steps~~ | ~~Cuando no hay recomendaciones/historial, el empty state no sugiere que hacer. Ej: "Swipe some games first to get recommendations"~~ **DONE** |
| **Media** | ~~Skeleton en WhyThisGame~~ | ~~El modal de explicacion AI muestra solo spinner, un skeleton con lineas seria mas profesional~~ **DONE** |

### 2.3 Navegacion y Responsividad

| Prioridad | Mejora | Detalle |
|-----------|--------|---------|
| **Media** | ~~Highlight de pagina activa en mobile~~ | ~~Los nav links no marcan la pagina actual en el menu hamburguesa~~ **DONE** |
| **Media** | ~~Filtros no se resetean entre tabs~~ | ~~En MyLists y History, cambiar de tab mantiene filtros del tab anterior — confuso~~ **DONE** |
| **Baja** | ~~Scroll position en discovery~~ | ~~Al volver de GameDetail, el discovery queue no mantiene la posicion~~ **DONE** |

### 2.4 Accesibilidad

| Prioridad | Mejora | Detalle |
|-----------|--------|---------|
| **Media** | ~~Focus trap en modales~~ | ~~WhyThisGame y MediaGallery no atrapan el foco — Tab puede navegar detras del modal~~ **DONE** |
| **Media** | ~~Labels en botones de swipe~~ | ~~SwipeControls tiene iconos sin texto visible ni aria-label descriptivo~~ **DONE** |
| **Baja** | ~~Skip-to-content link~~ | ~~No hay link para saltar al contenido principal~~ **DONE** |

---

## 3. Mejoras a Features Existentes

### 3.1 Discovery / Swipe

| Mejora | Detalle |
|--------|---------|
| ~~**Swipe gestures tactiles**~~ | ~~En mobile, no hay soporte para swipe con dedo — solo botones. Implementar touch gestures (pointerdown/pointermove) haria la experiencia mucho mas natural~~ **DONE** |
| ~~**Preview antes de swipear**~~ | ~~La GameCard en discovery muestra poca info. Un tap/click en la carta podria expandir detalles sin salir del flujo de swipe~~ **DONE** |
| ~~**Undo ultimo swipe**~~ | ~~No hay forma de deshacer un swipe accidental. Un boton "Undo" o Ctrl+Z para el ultimo swipe seria muy util~~ **DONE** |
| ~~**Contador de sesion**~~ | ~~Mostrar cuantos juegos se han swiped en la sesion actual para dar sensacion de progreso~~ **DONE** |

### 3.2 Recommendations

| Mejora | Detalle |
|--------|---------|
| ~~**Feedback loop**~~ | ~~Cuando el usuario dismissea una recomendacion, ese feedback no se usa para mejorar futuras recomendaciones. El dismiss deberia penalizar juegos similares~~ **DONE** |
| ~~**Filtros en recomendaciones**~~ | ~~Solo hay sort, no hay filtros por genero/precio como en Discovery~~ **DONE** |
| ~~**Indicador de confianza**~~ | ~~Mostrar de que capa viene la recomendacion (AI vs heuristica) para que el usuario sepa cuando Ollama esta activo~~ **DONE** |
| ~~**Regeneracion parcial**~~ | ~~"Regenerate" borra todas las recomendaciones. Permitir regenerar solo las dismisseadas mantendria las buenas~~ **DONE** |

### 3.3 Backlog

| Mejora | Detalle |
|--------|---------|
| ~~**"Mark as Played" funcional**~~ | ~~El boton existe (`Backlog.tsx:477`) pero no tiene handler — es una feature incompleta~~ **DONE** |
| ~~**Tiempo estimado de juego**~~ | ~~Integrar datos de HowLongToBeat (o similar) para estimar cuanto tiempo toma completar cada juego~~ **DONE** |
| ~~**Prioridad manual**~~ | ~~Permitir al usuario drag-and-drop para reordenar su backlog manualmente, ademas de la prioridad AI~~ **DONE** |

### 3.4 History

| Mejora | Detalle |
|--------|---------|
| ~~**Filtro de fechas funcional**~~ | ~~El UI de date range existe (`History.tsx:189`) pero no filtra realmente — es feature incompleta~~ **DONE** |
| ~~**Exportar historial**~~ | ~~El boton de export existe (`History.tsx:332`) pero no tiene handler — feature incompleta~~ **DONE** |
| ~~**Estadisticas temporales**~~ | ~~Grafico de swipes por dia/semana para ver tendencias de actividad~~ **DONE** |

### 3.5 Profile / Gaming DNA

| Mejora | Detalle |
|--------|---------|
| ~~**Radar chart interactivo**~~ | ~~El radar chart es estatico. Click en un genero podria mostrar los juegos que contribuyen a ese score~~ **DONE** |
| ~~**Evolucion del perfil**~~ | ~~Guardar snapshots del taste profile para mostrar como evoluciona con el tiempo~~ **DONE** |
| ~~**Multiples AI summaries**~~ | ~~Permitir regenerar el AI summary y comparar con versiones anteriores~~ **DONE** |

---

## 4. Sugerencias de Features Futuros

> Nota: Sin features sociales, enfocado en uso local y privacidad.

### 4.1 Descubrimiento Avanzado

| Feature | Descripcion | Estado |
|---------|-------------|--------|
| ~~**"Similar a este juego"**~~ | ~~Dado un juego que el usuario ama, buscar juegos con generos/tags similares en el catalogo. Util para explorar a partir de un punto de referencia~~ | **DONE** |
| ~~**Modos de Discovery**~~ | ~~Diferentes modos de descubrimiento: "Hidden Gems" (alto review, bajo review count), "New Releases" (ultimo mes), "Genre Deep Dive" (un genero especifico), "Contrarian" (generos que el usuario no suele jugar)~~ | **DONE** |
| ~~**Blacklist de publishers/developers**~~ | ~~Permitir excluir publishers especificos (ej. juegos asset-flip) del discovery y recomendaciones~~ | **DONE** |
| ~~**Discovery por tiempo disponible**~~ | ~~"Tengo 2 horas libres" — mostrar juegos cortos que encajen con el perfil~~ | **DONE** |

### 4.2 Gestion de Biblioteca

| Feature | Descripcion | Estado |
|---------|-------------|--------|
| ~~**Colecciones/Tags personales**~~ | ~~Crear colecciones como "Para jugar en verano", "Cozy games", "Juegos dificiles" — organizacion manual que complementa la automatica~~ | **DONE** |
| ~~**Notas personales por juego**~~ | ~~Campo de texto libre en GameDetail para anotar por que quieres jugar un juego, o notas de progreso~~ | **DONE** |
| ~~**Tracking de progreso**~~ | ~~Marcar juegos como "Playing", "Completed", "Abandoned" con fecha. Historial de que estas jugando actualmente~~ | **DONE** |
| ~~**Importar de otras fuentes**~~ | ~~Importar listas de GOG, Epic, o incluso un CSV manual para tener un catalogo unificado~~ | **DONE** |

### 4.3 Analisis y Datos

| Feature | Descripcion | Estado |
|---------|-------------|--------|
| ~~**Dashboard de estadisticas**~~ | ~~Pagina dedicada con: valor total de biblioteca, juegos por genero/ano, ratio jugado/no-jugado, horas por mes, top 10 juegos mas jugados~~ | **DONE** |
| ~~**"Year in Review"**~~ | ~~Resumen estilo Spotify Wrapped: genero del ano, juego mas jugado, cantidad de descubrimientos, evolucion del perfil~~ | **DONE** |
| ~~**Deals tracker**~~ | ~~Monitorear precios de juegos en wishlist/bookmarks usando datos de Steam. Notificacion cuando un juego deseado baja de precio (sin third-party, solo Steam Store API)~~ | **DONE** |
| ~~**Comparacion de taste profiles**~~ | ~~Exportar tu perfil y comparar con otro perfil exportado (sin necesidad de servidor compartido — ambos exportan JSON y se comparan localmente)~~ | **DONE** |

### 4.4 AI Avanzado

| Feature | Descripcion | Estado |
|---------|-------------|--------|
| ~~**Conversacion con tu perfil**~~ | ~~Chat con Ollama donde puedes hacer preguntas como "Que juego deberia jugar si me gusto Hades?" o "Recomiendame algo relajante". El AI tiene contexto de tu perfil completo~~ | **DONE** |
| ~~**Auto-categorization**~~ | ~~AI clasifica automaticamente los juegos de tu biblioteca en categorias (RPG largo, indie corto, multiplayer casual, etc.) basandose en metadata + tu playtime~~ | **DONE** |
| ~~**Mood-based recommendations**~~ | ~~Seleccionar un mood (relajado, competitivo, narrativo, exploracion) y obtener recomendaciones filtradas por ese estado de animo~~ | **DONE** |
| ~~**Resumen de reviews**~~ | ~~AI resume las reviews de Steam de un juego en 2-3 frases, destacando pros/cons segun lo que al usuario le importa~~ | **DONE** |

### 4.5 Calidad de Vida

| Feature | Descripcion | Estado |
|---------|-------------|--------|
| ~~**Keyboard shortcuts globales**~~ | ~~Shortcuts en todas las paginas (ej. `G D` para ir a Discovery, `G R` para Recommendations, `G P` para Profile)~~ | **DONE** |
| ~~**Tema claro**~~ | ~~Actualmente solo hay dark mode. Un toggle dark/light beneficiaria a usuarios que prefieren temas claros~~ | **DONE** |
| ~~**Backup automatico**~~ | ~~Backup periodico de la DB a un directorio configurable. Una linea de defensa contra corrupcion de datos~~ | **DONE** |
| ~~**Configuracion centralizada**~~ | ~~Pagina de Settings con: cache TTL, rate limits, Ollama URL/modelo, idioma, tema, directorio de backup~~ | **DONE** |

---

## Priorizacion Sugerida

Si quieres atacar esto por fases, este seria el orden sugerido:

**Fase inmediata (quick wins) — COMPLETADA:**
1. ~~Toasts de feedback en swipes, bookmarks y errores~~ **DONE**
2. ~~Completar features rotas: "Mark as Played", date filter en History, export en History~~ **DONE**
3. ~~Indices en DB~~ **DONE**
4. ~~Timeout en sync~~ **DONE**

**Fase siguiente (mejoras de impacto):**
5. Touch gestures en Discovery (mobile)
6. Undo ultimo swipe
7. Feedback loop en dismiss de recomendaciones
8. "Similar a este juego"
9. Colecciones/tags personales

**Fase futura (features nuevas):**
10. Chat con tu perfil (AI conversacional)
11. Dashboard de estadisticas
12. Modos de Discovery
13. Mood-based recommendations
14. Settings page centralizada
