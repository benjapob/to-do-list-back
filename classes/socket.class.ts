import moment from 'moment';
import { DefaultEventsMap, Server } from "socket.io";

export const SocketClass = new (class SocketClass {    constructor() {}

    public escucharSocket(io: Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>): void {
        io.on("connection", (socket: {
            emit(arg0: string, arg1: string): unknown; id: any; on: (arg0: string, arg1: () => void) => void; 
        }) => {
            // console.log("Usuario conectado:", socket.id);
            this.updateTasks(io);
        });
    }

    public async updateTasks(io:any) {
      let inicioDia = moment().startOf('day').toDate();
      let finDia = moment().endOf('day').toDate();
      io?.emit('actualizacionFila', {
          tasks: []
      } as any);
    }
});