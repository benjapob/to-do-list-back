import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import cors from 'cors';
import moment from 'moment';
import socketIO from 'socket.io';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { SocketClass } from './classes/socket.class';
const sqlite3 = require('sqlite3').verbose();
import Turno from './models/turno.model';

// Cargar variables de entorno
dotenv.config();

// Validar variables de entorno
const PORT = parseInt(process.env.PORT || '3003', 10);
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
    SocketClass.escucharSocket(this.io); //Inicializar el socket

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
    // Aquí puedes agregar tus rutas
    this.app.get('/tasks', (req: Request, res: Response) => {
      // Obtener todas las tareas
      const sql = `SELECT * FROM tasks`;
      this.db.all(sql, [], (err:any, rows:any) => {
          if (err) {
              return res.status(400).json({ error: err.message });
          }
          res.json(rows);
      });
    });

    
    this.app.post('/tasks', (req: Request, res: Response) => {
      try {
        // Crear una nueva tarea
        const { titulo, descripcion} = req.body;
        // Validar campos requeridos
        if (!titulo || !descripcion) {
            res.status(400).json({ error: 'Faltan campos requeridos' });
            return;
        }
        // Validar longitud de los campos
        if (titulo.length > 100 || descripcion.length > 500) {
            res.status(400).json({ error: 'Longitud de campos excedida' });
            return;
        }
        // Sanitizar entradas
        const sanitizedTitulo = this.sanitizeInput(titulo);
        const sanitizedDescripcion = this.sanitizeInput(descripcion);
        // Insertar la tarea en la base de datos
        const sql = `INSERT INTO tasks (titulo, descripcion) VALUES (?, ?)`;
        this.db.run(sql, [sanitizedTitulo, sanitizedDescripcion], function(err: any) {
            if (err) {
                res.status(400).json({ error: err.message });
                return;
            } else {
                res.status(201).json({ message: 'Tarea creada correctamente' });
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
    
    this.app.post('/deleteTurno', (req: Request, res: Response) => {
      try {
        Turno.findOneAndUpdate({_id:req.body.id}, {$set:{estado:'Cancelado'}}, {new:true}).then((turno) => {
          if (turno) {
            res.json({ ok: true, turno});
            SocketClass.updateFilaVirtual(this.io);
          } else {
            res.json({ ok: false, error: 'Error al actualizar turno' });
          }
        }).catch((err) => {
          console.error(err);
          res.json({ ok: false, error: 'Error al actualizar turno' });
        });
        
      } catch (error) {
          console.error(error);
          res.json({ ok: false, error: 'Error al actualizar turno' });
      }
    });

    this.app.post('/updateTurno', (req: Request, res: Response) => {
      try {
        let estado:string;
        switch (req.body.estado) {
          case 'espera':
            estado = 'En espera'
            break;
          case 'atencion':
            estado = 'En atención'
            
            break;
          case 'finalizado':
            estado = 'Finalizado'
            
            break;
          default:
            estado = 'En espera'
            break;
        }
        Turno.findOneAndUpdate({_id:req.body.id}, {$set:{estado:estado}}, {new:true}).then((turno) => {
          if (turno) {
            res.json({ ok: true, turno});
            SocketClass.updateFilaVirtual(this.io);
          } else {
            res.json({ ok: false, error: 'Error al actualizar turno' });
          }
        }).catch((err) => {
          console.error(err);
          res.json({ ok: false, error: 'Error al actualizar turno' });
        });
        
      } catch (error) {
          console.error(error);
          res.json({ ok: false, error: 'Error al actualizar turno' });
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
            descripcion TEXT CHECK (length(titulo) <= 500),
            status TEXT DEFAULT 'pendiente',
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