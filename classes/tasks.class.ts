
import { DefaultEventsMap, Server } from "socket.io";
import moment from "moment";

export const TaskClass = new (class TaskClass {
    constructor() {}

    public initSocket(io: Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>, db:any): void {
        io.on("connection", (socket: {
            emit(arg0: string, arg1: string): unknown; id: any; on: (arg0: string, arg1: () => void) => void; 
        }) => {
            console.log("Usuario conectado:", socket.id);
        });
    }

    // Obtener todas las tareas de la base de datos
    public async getTasks(io: Server, db: any) {
        try {
            const sql = `SELECT * FROM tasks`;
            const rows = await db.all(sql, []);

            // Verificar si se obtuvieron tareas
            if (!rows || rows.length === 0) {
                return [];
            }
            return rows;
        } catch (error: any) {
            console.error('Error al obtener tareas:', error);
            throw new Error(`Error al obtener tareas: ${error.message}`);
        }
    }

    // Agregar una nueva tarea
    public async addTask(io: any, db: any, task: any): Promise<any> {
        try {
            const sql = `INSERT INTO tasks (titulo, description, status) VALUES (?, ?, ?)`;
            const result = await db.run(sql, [task.sanitizedTitulo, task.sanitizedDescription, task.sanitizedStatus]);
            
            // Devolver el ID de la tarea recién creada
            const taskId = result.lastID;
            
            // Mandar socket
            io?.emit('newTask', {
                task: {
                    id: taskId,
                    titulo: task.sanitizedTitulo,
                    description: task.sanitizedDescription,
                    status: task.sanitizedStatus,
                    fechaCreacion: moment().format('YYYY-MM-DD HH:mm:ss'),
                    fechaActualizacion: moment().format('YYYY-MM-DD HH:mm:ss')
                }
            });

            return taskId;
        } catch (err) {
            console.error('Error al crear tarea:', err);
            throw err;
        }
    }

    // Actualizar el estado de una tarea
    public async updateTask(io: any, db: any, task: any): Promise<any> {
        const sql = `UPDATE tasks SET status = ? WHERE id = ?`;
        try {
            const result = await db.run(sql, [task.sanitizedStatus, task.id]);
            // Emitir evento de actualización de tarea
            io?.emit('taskUpdated', {
                task: {
                    id: task.id,
                    status: task.sanitizedStatus,
                    fechaActualizacion: moment().format('YYYY-MM-DD HH:mm:ss')
                }
            });
            return result.changes;
        } catch (err) {
            console.error('Error al actualizar tarea:', err);
            throw err;
        }
    }

    // Eliminar una tarea
    public async deleteTask(io: any, db:any, taskId: string): Promise<any> {
        try {
            const sql = `DELETE FROM tasks WHERE id = ?`;
            const result = await db.run(sql, [taskId]);
            // Mandar socket
            io?.emit('taskDeleted', {
                task: {
                    id: taskId,
                    fechaActualizacion: moment().format('YYYY-MM-DD HH:mm:ss')
                }
            } as any);
            
            return (result.changes);
            
        } catch (error) {
            console.error('Error al eliminar tarea:', error);
            throw error;
            
        }
    }
})();
// Esta clase maneja las operaciones CRUD para las tareas.