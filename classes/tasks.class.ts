
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

    public async getTasks(io: any, db: any): Promise<any> {
        // Obtener todas las tareas de la base de datos
        return new Promise((resolve, reject) => {
        const sql = `SELECT * FROM tasks`;
        db.all(sql, [], (err: any, rows: any) => {
            if (err) {
                // Manejar el error de la consulta
                console.error('Error al obtener las tareas:', err);
                reject(err);
                return;
            } else {
                // Devolver la lista de tareas
                resolve(rows);
            }
            });
        });
    }

    public async addTask(io:any, db:any, task:any): Promise<any> {
        // Insertar la tarea en la base de datos
        return new Promise((resolve, reject) => {
            const sql = `INSERT INTO tasks (titulo, description, status) VALUES (?, ?, ?)`;
            db.run(sql, [task.sanitizedTitulo, task.sanitizedDescription, task.sanitizedStatus], function(err: any) {
                if (err) {
                    // Manejar el error de la inserción
                    console.error('Error al crear tarea:', err);
                    reject(err);
                    return;
                } else {
                    // Devolver el ID de la tarea recién creada
                    resolve(this.lastID);
                    // Mandar socket
                    io?.emit('newTask', {
                        task: {
                            id: this.lastID,
                            titulo: task.sanitizedTitulo,
                            description: task.sanitizeddescription,
                            status: task.sanitizedStatus,
                            fechaCreacion: moment().format('YYYY-MM-DD HH:mm:ss'),
                            fechaActualizacion: moment().format('YYYY-MM-DD HH:mm:ss')
                        }
                    } as any);
                    return;
                }
            });
        });
    }

    public async updateTask(io: any, db:any, task: any): Promise<any> {
        new Promise((resolve, reject) => {
            const sql = `UPDATE tasks SET status = ? WHERE id = ?`;
            db.run(sql, [task.sanitizedStatus, task.id], function(err: any) {
                if (err) {
                    // Manejar el error de la actualización
                    console.error('Error al actualizar tarea:', err);
                    reject(err);
                    return;
                } else {
                    resolve(this.changes);
                    // Mandar socket
                    io?.emit('taskUpdated', {
                        task: {
                            id: task.id,
                            status: task.sanitizedStatus,
                            fechaActualizacion: moment().format('YYYY-MM-DD HH:mm:ss')
                        }
                    } as any);
                    return;
                }
            });
        });
    }

    public async deleteTask(io: any, db:any, taskId: string): Promise<any> {
        new Promise((resolve, reject) => {
            
            const sql = `DELETE FROM tasks WHERE id = ?`;
            db.run(sql, [taskId], function(err: any) {
                if (err) {
                    // Manejar el error de la eliminación
                    console.error('Error al eliminar tarea:', err);
                    reject(err);
                    return;
                } else {
                    resolve(this.changes);
                    // Mandar socket
                    io?.emit('taskDeleted', {
                        task: {
                            id: taskId,
                            fechaActualizacion: moment().format('YYYY-MM-DD HH:mm:ss')
                        }
                    } as any);
                    return;
                }
            });
        });
    }
})();
// Esta clase maneja las operaciones CRUD para las tareas.