
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';

export async function initDatabase() {
    // Conectar a la base de datos SQLite
    try {
      const db = await open({
          filename: './database.db', // Archivo de la base de datos
          driver: sqlite3.Database
      });

      // Crear la tabla tasks si no existe
      await db.exec(`CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            titulo TEXT NOT NULL CHECK (length(titulo) <= 100),
            description TEXT CHECK (length(titulo) <= 500),
            status TEXT DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'en_proceso', 'completada')),
            fechaCreacion DATETIME DEFAULT CURRENT_TIMESTAMP,
            fechaActualizacion DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

      // Crear el trigger para actualizar la fecha de modificación
      await db.exec(`CREATE TRIGGER IF NOT EXISTS actualizar_fecha
            AFTER UPDATE ON tasks
            FOR EACH ROW
            BEGIN
                UPDATE tasks
                SET fechaActualizacion = CURRENT_TIMESTAMP
                WHERE id = OLD.id;
            END;`);

      // Asignar la base de datos a la instancia
      console.log('Conexión a la base de datos establecida correctamente');
      return db;
      
    } catch (error) {
        console.error('Error al inicializar la base de datos:', error);
        throw new Error(`No se pudo inicializar la base de datos: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  }