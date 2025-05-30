import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import cors from 'cors';
import moment from 'moment';
import socketIO from 'socket.io';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { TaskClass } from './classes/tasks.class';
import { initDatabase } from './database/db';

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

    this.configureMiddleware();
    this.configureRoutes();
    this.configureDB();
    this.configureErrorHandling();
    TaskClass.initSocket(this.io, this.db);
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
      TaskClass.getTasks(this.io, this.db)
        .then((tasks: any) => {          
          res.status(200).json(tasks);
        })
        .catch((err: any) => {
          console.error('Error al obtener las tareas:', err);
          res.status(500).json({ error: 'Error interno del servidor' });
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
        const sanitizedDescription = this.sanitizeInput(description);
        const sanitizedStatus = this.sanitizeInput(status);

        // Insertar la tarea en la base de datos
        TaskClass.addTask(this.io, this.db, {
          sanitizedTitulo,
          sanitizedDescription,
          sanitizedStatus: sanitizedStatus || 'pendiente'
        })
        .then((taskId: number) => {
          res.status(201).json({
            message: 'Tarea creada correctamente',
            id: taskId,
            titulo: sanitizedTitulo,
            description: sanitizedDescription,
            status: sanitizedStatus || 'pendiente',
            fechaCreacion: moment().format('YYYY-MM-DD HH:mm:ss'),
            fechaActualizacion: moment().format('YYYY-MM-DD HH:mm:ss')
          });
        })
        .catch((err: any) => {
          console.error('Error al crear la tarea:', err);
          res.status(500).json({ error: 'Error interno del servidor' });
        });

      } catch (error) {
        // Manejo de errores
        console.error(error);
        res.status(500).json({ error: 'Error interno del servidor' });
        return;
      }
    });

    // Actualizar el estado de una tarea
    this.app.put('/tasks/:id', (req: Request, res: Response) => {
      try {
        const id = req.params.id;
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
        TaskClass.updateTask(this.io, this.db, {
          id: this.sanitizeInput(id as string),
          sanitizedStatus
        })
        .then((changes: number) => {
          if (changes === 0) {
            res.status(404).json({ error: 'Tarea no encontrada' });
            return;
          }
          res.status(200).json({
            message: 'Tarea actualizada correctamente',
            id: this.sanitizeInput(id as string),
            status: sanitizedStatus,
            fechaActualizacion: moment().format('YYYY-MM-DD HH:mm:ss')
          });
        })
        .catch((err: any) => {
          console.error('Error al actualizar la tarea:', err);
          res.status(500).json({ error: 'Error interno del servidor' });
        });
        
      } catch (error) {
          console.error(error);
          res.json({ error: 'Error interno del servidor' });
      }
    });
    
    // Eliminar un turno
    this.app.delete('/tasks/:id', (req: Request, res: Response) => {
      try {
        const id = req.params.id;
        // Validar campos requeridos
        if (!id) {
            res.status(400).json({ error: 'El ID es requerido' });
            return;
        }
        // Sanitizar entrada
        const sanitizedId = this.sanitizeInput(id as string);
        // Eliminar la tarea de la base de datos
        TaskClass.deleteTask(this.io, this.db, sanitizedId)
        .then((changes: number) => {
          if (changes === 0) {
            res.status(404).json({ error: 'Tarea no encontrada' });
            return;
          }
          res.status(200).json({ message: 'Tarea eliminada correctamente', id: sanitizedId });
        })
        .catch((err: any) => {
          console.error('Error al eliminar la tarea:', err);
          res.status(500).json({ error: 'Error interno del servidor' });
        });
      } catch (error) {
          console.error(error);
          res.json({ ok: false, error: 'Error interno del servidor' });
      }
    });
  }

  private async configureDB() {
    try {
      this.db = await initDatabase(); // Usar initDatabase de db.ts
    } catch (error) {
      console.error('Error al conectar a la base de datos:', error);
      throw error;
    }
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