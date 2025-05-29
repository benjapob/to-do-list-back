# Backend de Lista de Tareas

Este es un backend en Node.js construido con TypeScript, Express y SQLite para gestionar una lista de tareas. Proporciona una API RESTful para operaciones CRUD sobre tareas y utiliza WebSocket (vía Socket.IO) para emitir actualizaciones en tiempo real a los clientes conectados. La aplicación incluye medidas de seguridad como limitación de solicitudes, CORS y sanitización de entradas.

## Tabla de Contenidos
- [Prerrequisitos](#prerrequisitos)
- [Instalación](#instalación)
- [Ejecutar la Aplicación](#ejecutar-la-aplicación)
- [Probar la Funcionalidad WebSocket](#probar-la-funcionalidad-websocket)
- [Decisiones de Diseño](#decisiones-de-diseño)
- [Estructura del Proyecto](#estructura-del-proyecto)

## Prerrequisitos
- **Node.js**: Versión 14 o superior.
- **npm**: Versión 6 o superior.
- Un editor de código (por ejemplo, VS Code) para desarrollo.

## Instalación
1. **Clonar el repositorio** (si aplica):
   ```bash
   git clone https://github.com/benjapob/to-do-list-back
   cd todo-list-back
   ```

2. **Instalar dependencias**:
   ```bash
   npm install
   ```
   Esto instala los paquetes necesarios:
   - `express`: Framework web para la API.
   - `sqlite`: Base de datos SQLite con soporte para promesas.
   - `socket.io`: Para comunicación WebSocket en tiempo real.
   - `moment`: Para manejo de fechas (considera reemplazar por `date-fns`).
   - `cors`, `helmet`, `express-rate-limit`: Para seguridad y manejo de CORS.
   - `typescript`, `ts-node`, `nodemon`: Para TypeScript y desarrollo.

3. **Configurar variables de entorno**:
    (opcional)
   Crea un archivo `.env` en la raíz del proyecto con lo siguiente:
   ```env
   PORT=3000
   ENV=DEV
   ALLOWED_ORIGINS=http://localhost:3000,http://example.com
   ```
   - `PORT`: Puerto donde se ejecuta el servidor.
   - `ENV`: `DEV` para desarrollo (permite todos los orígenes CORS) o `PROD` para producción (restringe a `ALLOWED_ORIGINS`).
   - `ALLOWED_ORIGINS`: Lista de orígenes CORS permitidos, separados por comas (usado en producción).

4. **Inicializar la base de datos**:
   La aplicación crea automáticamente un archivo `database.db` y la tabla `tasks` al iniciarse usando SQLite. No se requiere configuración manual de la base de datos.

## Ejecutar la Aplicación
1. **Compilar el proyecto**:
   ```bash
   npm run build
   ```
   Esto compila los archivos TypeScript de `src/` a `dist/`.

2. **Iniciar la aplicación**:
   ```bash
   npm start
   ```
   El servidor se ejecutará en `http://localhost:3000` (o el puerto especificado en `.env`).

3. **Modo de desarrollo** (con recarga automática):
   ```bash
   npm run dev
   ```
   Usa `nodemon` y `ts-node` para ejecutar la aplicación y recargar al modificar el código.

4. **Endpoints de la API**:
   - `GET /tasks`: Obtiene todas las tareas.
   - `POST /tasks`: Crea una nueva tarea (requiere `titulo` en el cuerpo; `description` y `status` son opcionales).
   - `PUT /tasks/:id`: Actualiza el estado de una tarea (requiere `id` en la query y `status` en el cuerpo).
   - `DELETE /tasks/:id`: Elimina una tarea (requiere `id` en la query).

   Ejemplo de cuerpo para `POST /tasks`:
   ```json
   {
     "titulo": "Nueva Tarea",
     "description": "Descripción de la tarea",
     "status": "pendiente"
   }
   ```

## Probar la Funcionalidad WebSocket
Dado que no hay frontend, puedes probar la funcionalidad WebSocket usando un cliente como [Postman](https://www.postman.com/), [Insomnia](https://insomnia.rest/), o un archivo HTML simple.

### Usar un Cliente WebSocket
1. **Conectar al WebSocket**:
   - Abre Postman o Insomnia.
   - Crea una solicitud WebSocket a `ws://localhost:3000`.
   - Conéctate al servidor. Deberías ver un mensaje en la consola del servidor: `Usuario conectado: <socket.id>`.

2. **Probar eventos WebSocket**:
   - Realiza solicitudes a la API para disparar eventos WebSocket:
     - `POST /tasks`: Dispara un evento `newTask` con la tarea creada.
     - `PUT /tasks/:id`: Dispara un evento `taskUpdated` con la tarea actualizada.
     - `DELETE /tasks/:id`: Dispara un evento `taskDeleted` con el ID de la tarea eliminada.
     - `GET /tasks`: Dispara un evento `tasks` con la lista de tareas.
   - En tu cliente WebSocket, escucha estos eventos (`newTask`, `taskUpdated`, `taskDeleted`, `tasks`) para ver los datos emitidos.

### Flujo de Prueba de Ejemplo
1. Inicia el servidor (`npm run dev`).
2. Abre `index.html` en un navegador o conéctate vía Postman WebSocket.
3. Envía una solicitud `POST /tasks` usando curl o Postman:
   ```bash
   curl -X POST http://localhost:3000/tasks -H "Content-Type: application/json" -d '{"titulo":"Tarea de Prueba","description":"Test","status":"pendiente"}'
   ```
4. Verifica que el evento `newTask` aparezca en tu cliente WebSocket o navegador.

## Decisiones de Diseño
- **SQLite como Base de Datos**: Elegido por su simplicidad, ligereza y adecuación para aplicaciones de tamaño pequeño a mediano. Se usó el paquete `sqlite` en lugar de `sqlite3` directamente para aprovechar el soporte nativo de promesas, lo que simplifica las operaciones asíncronas y evita problemas de promisificación manual.
- **Express y TypeScript**: Express ofrece un framework robusto para construir APIs RESTful, mientras que TypeScript garantiza seguridad de tipos y mejor mantenibilidad. Se definieron interfaces (por ejemplo, `Task`) para mejorar la legibilidad y detectar errores en tiempo de compilación.
- **WebSocket con Socket.IO**: Implementado para notificar a los clientes en tiempo real sobre cambios en las tareas (creación, actualización, eliminación). Los eventos `newTask`, `taskUpdated`, `taskDeleted` y `tasks` permiten actualizaciones dinámicas en un frontend futuro.
- **Seguridad**:
  - `helmet`: Agrega cabeceras de seguridad HTTP.
  - `express-rate-limit`: Limita solicitudes por IP para prevenir ataques de fuerza bruta.
  - `cors`: Configurado para permitir orígenes específicos en producción y todos en desarrollo.
  - Sanitización de entradas: La función `sanitizeInput` previene inyecciones SQL y limpia las entradas del usuario.
- **Trigger de Base de Datos**: Un trigger SQLite (`actualizar_fecha`) actualiza automáticamente la columna `fechaActualizacion` en la tabla `tasks` tras cada actualización, asegurando consistencia sin lógica adicional en el código.

## Estructura del Proyecto
```
todo-list-back/
├── src/
│   ├── classes/
│   │   └── tasks.class.ts  # Lógica de operaciones CRUD para tareas
│   ├── database/
│   │   └── db.ts          # Configuración de la base de datos SQLite
│   └── index.ts           # Punto de entrada, configura Express y Socket.IO
├── database.db            # Archivo de la base de datos SQLite
├── .env                   # Variables de entorno
├── package.json           # Dependencias y scripts
└── tsconfig.json          # Configuración de TypeScript
```