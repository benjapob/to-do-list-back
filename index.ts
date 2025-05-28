import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import cors from 'cors';
import moment from 'moment';
import socketIO from 'socket.io';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
const sqlite3 = require('sqlite3').verbose();

// Cargar variables de entorno
dotenv.config();

// Validar variables de entorno
const PORT = parseInt(process.env.PORT || '3000', 10);
const ENV = process.env.ENV || 'DEV';
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || [];

class Server {
  public app: express.Application;
  private db:any; // Base de datos SQLite
  private httpServer: http.Server;
  public io: socketIO.Server;
  private port: number;

  constructor() {
    this.app = express();
    this.port = PORT;
    this.httpServer = new http.Server(this.app);
    this.io = require('socket.io')(this.httpServer, {
      cors: {
        origin: ENV === 'DEV' ? '*' : ALLOWED_ORIGINS,
        credentials: true,
      },
    });

    // Cuando se conecta un cliente, enviar las tareas en base
    this.io.on("connection", (socket: {emit(arg0: string, arg1: string): unknown; id: any; on: (arg0: string, arg1: () => void) => void; }) => {
      console.log("Usuario conectado:", socket.id);
      const sql = `SELECT * FROM tasks`;
      this.db.all(sql, [], (err:any, rows:any) => {
          if (err) {
              console.error('Error al obtener tareas:', err);
              return;
          }
          this.io?.emit('tareasInicial', {
              tasks: rows.map((row:any) => ({
                  id: row.id,
                  titulo: row.titulo,
                  description: row.description,
                  status: row.status,
                  fechaCreacion: moment(row.fechaCreacion).format('YYYY-MM-DD HH:mm:ss'),
                  fechaActualizacion: moment(row.fechaActualizacion).format('YYYY-MM-DD HH:mm:ss')
              }))
          } as any);
      });
    });

    this.configureMiddleware();
    this.configureRoutes();
    this.configureDB();
    this.configureErrorHandling();
  }

  private configureMiddleware() {
    // Headers de seguridad
    this.app.use(helmet());

    // Limitación de peticiones
    this.app.use(
      rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // Limit each IP to 100 requests per windowMs
      })
    );

    // CORS
    this.app.use(
      cors({
        origin: (origin, callback) => {
          if (ENV === 'DEV') {
            callback(null, true);
          } else if (!origin || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, origin);
          } else {
            callback(new Error('CORS blocked'));
          }
        },
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'app-token', 'x-token', 'Authorization'],
        exposedHeaders: ['Content-Type', 'Cache-Control', 'Connection'],
        credentials: true,
      })
    );

    // JSON parsing
    this.app.use(express.json());
  }

  private configureRoutes() {
    // Obtener todas las tareas
    this.app.get('/tasks', (req: Request, res: Response) => {
      const sql = `SELECT * FROM tasks`;
      this.db.all(sql, [], (err:any, rows:any) => {
          if (err) {
              return res.status(400).json({ error: err.message });
          }
          res.json(rows);
      });
    });

    // Crear una nueva tarea
    this.app.post('/tasks', (req: Request, res: Response) => {
      try {
        const { titulo } = req.body;
        const description = req.body.description || '';
        const status = req.body.status || '';
        // Validar campos requeridos
        if (!titulo) {
            res.status(400).json({ error: 'El título es requerido' });
            return;
        }
        if (status && !['pendiente', 'en_proceso', 'completada'].includes(status)) {
            res.status(400).json({ error: 'Estado inválido' });
            return;
        }
        // Validar longitud de los campos
        if (titulo.length > 100 || description.length > 500) {
            res.status(400).json({ error: 'Longitud de campos excedida' });
            return;
        }
        // Sanitizar entradas
        const sanitizedTitulo = this.sanitizeInput(titulo);
        const sanitizeddescription = this.sanitizeInput(description);
        const sanitizedStatus = this.sanitizeInput(status);
        // Insertar la tarea en la base de datos
        const sql = `INSERT INTO tasks (titulo, description, status) VALUES (?, ?, ?)`;
        this.db.run(sql, [sanitizedTitulo, sanitizeddescription, sanitizedStatus], function(err: any) {
            if (err) {
                res.status(400).json({ error: err.message });
                return;
            } else {
                res.status(201).json({ message: 'Tarea creada correctamente', id: this.lastID });
                
                // Mandar socket
                this.io?.emit('newTask', {
                    task: {
                        id: this.lastID,
                        titulo: sanitizedTitulo,
                        description: sanitizeddescription,
                        status: sanitizedStatus,
                        fechaCreacion: moment().format('YYYY-MM-DD HH:mm:ss'),
                        fechaActualizacion: moment().format('YYYY-MM-DD HH:mm:ss')
                    }
                } as any);
                return;
            }
        });
      } catch (error) {
        // Manejo de errores
        console.error(error);
        res.status(500).json({ error: 'Error interno del servidor' });
        return;
      }
    });

    // Actualizar el estado de una tarea
    this.app.put('/tasks', (req: Request, res: Response) => {
      try {
        const id = req.query.id;
        const {status} = req.body;
        // Validar campos requeridos
        if (!id) {
            res.status(400).json({ error: 'El ID es requerido' });
            return;
        }
        if (!status || !['pendiente', 'en_proceso', 'completada'].includes(status)) {
            res.status(400).json({ error: 'Estado inválido' });
            return;
        }
        const sanitizedStatus = this.sanitizeInput(status);
        // Insertar la tarea en la base de datos
        const sql = `UPDATE tasks SET status = ? WHERE id = ?`;
        this.db.run(sql, [sanitizedStatus, id], function(err: any) {
            if (err) {
                res.status(400).json({ error: err.message });
                return;
            } else if (this.changes === 0) {
                res.status(404).json({ error: 'Tarea no encontrada' });
                return;
            } else {
                res.status(201).json({ message: 'Tarea actualizada correctamente', id: id, status: sanitizedStatus });

                // Mandar socket
                this.io?.emit('taskUpdated', {
                    task: {
                        id: id,
                        status: sanitizedStatus,
                        fechaActualizacion: moment().format('YYYY-MM-DD HH:mm:ss')
                    }
                } as any);
                return;
            }
        });
        
      } catch (error) {
          console.error(error);
          res.json({ error: 'Error interno del servidor' });
      }
    });
    
    // Eliminar un turno
    this.app.delete('/tasks', (req: Request, res: Response) => {
      try {
        // Eliminar un turno
        const id = req.query.id;
        // Validar campos requeridos
        if (!id) {
            res.status(400).json({ error: 'El ID es requerido' });
            return;
        }
        // Sanitizar entrada
        const sanitizedId = this.sanitizeInput(id as string);
        // Eliminar la tarea de la base de datos
        const sql = `DELETE FROM tasks WHERE id = ?`;
        this.db.run(sql, [sanitizedId], function(err: any) {
            if (err) {
                res.status(400).json({ error: err.message });
                return;
            } else if (this.changes === 0) {
                res.status(404).json({ error: 'Tarea no encontrada' });
                return;
            } else {
                res.status(200).json({ message: 'Tarea eliminada correctamente', id: sanitizedId });
                // Mandar socket
                this.io?.emit('taskDeleted', {
                    task: {
                        id: id,
                        fechaActualizacion: moment().format('YYYY-MM-DD HH:mm:ss')
                    }
                } as any);
                return;
            }
        });
      } catch (error) {
          console.error(error);
          res.json({ ok: false, error: 'Error interno del servidor' });
      }
    });
  }

  private configureDB() {
    // Aquí puedes configurar tu conexión a la base de datos
    this.db = new sqlite3.Database('./database.db', (err: { message: any; }) => {
        if (err) {
            console.error('Error al conectar con la base de datos:', err.message);
        } else {
            console.log('Conectado a la base de datos SQLite.');
        }
    });

    // Crear la tabla si no existe
    this.db.serialize(() => {
        this.db.run(`CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            titulo TEXT NOT NULL CHECK (length(titulo) <= 100),
            description TEXT CHECK (length(titulo) <= 500),
            status TEXT DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'en_proceso', 'completada')),
            fechaCreacion DATETIME DEFAULT CURRENT_TIMESTAMP,
            fechaActualizacion DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err: any) => {
            if (err) {
                console.error('Error al crear la tabla tasks:', err.message);
            }
        });
    });

    // Crear el trigger para actualizar la fecha de modificación
    this.db.run(`CREATE TRIGGER IF NOT EXISTS actualizar_fecha
            AFTER UPDATE ON tasks
            FOR EACH ROW
            BEGIN
                UPDATE tasks
                SET fechaActualizacion = CURRENT_TIMESTAMP
                WHERE id = OLD.id;
            END;`, (err:any) => {
        if (err) {
            console.error('Error al crear el trigger:', err.message);
        }
    });
  }

  private configureErrorHandling() {
    // Manejo de errores
    this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      console.error(err.stack);
      res.status(500).send('Error en el sistema');
    });

    this.io.on('error', (err) => {
      console.error('Socket.IO error:', err);
    });
  }

  private sanitizeInput(input: string): string {
    // Sanitizar la entrada para evitar inyecciones SQL
    return input.replace(/'/g, "''").trim();
  }

  public start() {
    // Iniciar el servidor
    this.httpServer.listen(this.port, () => {
      console.log(`Servidor escuchando en el puerto ${this.port}`);
    });
    this.httpServer.setTimeout(20 * 60 * 1000); // 20 minutes
  }
}

const server = new Server();
server.start();