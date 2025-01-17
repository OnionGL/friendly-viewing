import { OnModuleInit } from "@nestjs/common";
import { MessageBody, OnGatewayConnection, SubscribeMessage, WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import { Server , Socket } from 'socket.io'
import { UserService } from "src/user/user.service";

interface roomBody {
    roomId: string,
    currentUserId: number,
    alertMessage: string,
    alertType?: AlertTypes
    adminId?: number
}

export enum AlertTypes {
    WARNING="WARNING",
    SUCCESS="SUCCESS",
    ERROR="ERROR"
}


@WebSocketGateway({ cors: true })
export class Gateway implements OnModuleInit  {

    private historyMessages: { [roomId: string]: string[] } = {};

    private historyConnectedUsers: { [roomId: string]: {id: number , cliendData: any}[] } = {};

    private currentTime: number = 0

    constructor(
        // private userService: UserService
    ){}

    @WebSocketServer()
    public server: Server

    public onModuleInit() {
        this.server.on('connection' , (socket) => {})
    }

    @SubscribeMessage('joinRoom')
    public handleJoinRoom(client: Socket, data: roomBody) {

        const roomId = data.roomId

        const currentUserId = data.currentUserId

        client.join(roomId);

        if(!this.historyConnectedUsers[roomId]) {
            this.historyConnectedUsers[roomId] = []
        }

        if(!this.historyConnectedUsers[roomId].find(({id}) => id == currentUserId)) {
            this.historyConnectedUsers[roomId].push({id: currentUserId , cliendData: client})
        }

        if (this.historyMessages[roomId]) {
            client.emit('history', this.historyMessages[roomId]);
        }

        if(data?.alertMessage) {
            this.server.to(roomId).except(client.id).emit("alertMessages" , {message: data.alertMessage , alertType: data?.alertType})
        }
        
        this.server.to(roomId).emit('joinedRoom', this.historyConnectedUsers[roomId]?.map(({id}) => id));

        this.server.to(roomId).emit("timerUpload" , {time: this.currentTime})

    }

    @SubscribeMessage('timerUpdate')
    timeUpdate(client: Socket , data: {roomId: string , time: number}) {
        this.currentTime = data.time
        this.server.to(data.roomId).emit("timerUpload" , {time: this.currentTime})
    }


    @SubscribeMessage("removeUsers")
    removeUsers(client: Socket , data: {alertMessage?: string, alertType?: AlertTypes, roomId: string , removeUserId: number}) {

        const roomId = data.roomId

        const cliendData = this.historyConnectedUsers[roomId].find(({id}) => id == data.removeUserId)

        
        cliendData.cliendData.to(roomId).emit('removeUserId' , data.removeUserId)
        cliendData.cliendData.to(roomId).emit('joinedRoom', this.historyConnectedUsers[roomId].filter(({id}) => id !== data.removeUserId).map(({id}) => id));

        setTimeout(_ => {
            cliendData.cliendData.to(data.roomId).socketsLeave()    
        } , 2000)

        this.historyConnectedUsers[roomId] = this.historyConnectedUsers[roomId].filter(({id}) => id !== data.removeUserId)

        this.server.to(roomId).emit('removeUserId' , data.removeUserId)

        this.server.to(roomId).emit('joinedRoom', this.historyConnectedUsers[roomId].map(({id}) => id));
    }

    @SubscribeMessage('leaveRoom')
    leaveRoom(client: Socket , data: roomBody) {

        if(data.adminId && data.adminId == data.currentUserId) {

            this.historyConnectedUsers[data.roomId].forEach(user => {
                if(user.id == data.adminId) {
                    user.cliendData.to(data.roomId).socketsLeave()
                }

                if(user.id !== data.adminId) {
                    this.server.to(data.roomId).except(client.id).emit("alertMessages" , {message: "Админ комнаты покинул ее" , alertType: AlertTypes.ERROR})
                }

                setTimeout(() => {
                    user.cliendData.to(data.roomId).socketsLeave()
                } , 3000)
            })
            
            this.historyConnectedUsers[data.roomId].forEach(user => {
                this.server.to(data.roomId).emit('removeUserId' , user.id)
            })

            this.historyConnectedUsers[data.roomId] = []

            return

        } 

        if(this.historyConnectedUsers[data.roomId]?.find(({id}) => id == data.currentUserId)) {
            const clientData = this.historyConnectedUsers[data.roomId].find(({id}) => id == data.currentUserId)

            clientData.cliendData.to(data.roomId).emit('removeUserId' , data.currentUserId)
            clientData.cliendData.to(data.roomId).emit('joinedRoom', this.historyConnectedUsers[data.roomId].filter(({id}) => id !== data.currentUserId).map(({id}) => id));

            setTimeout(_ => {
                clientData.cliendData.to(data.roomId).socketsLeave()   
            } , 2000)


            this.historyConnectedUsers[data.roomId] = this.historyConnectedUsers[data.roomId].filter(({id}) => data.currentUserId !== id)
        }

        this.server.to(data.roomId).emit("joinedRoom" , this.historyConnectedUsers[data.roomId]?.map(({id}) => id))
    }

    @SubscribeMessage('addVideo')
    addVideo(client: Socket , data: any) {
        
        const roomId = data.roomId

        this.server.to(roomId).emit("addingVideo" , {videoId: data.videoId})
    }


    @SubscribeMessage('changeCurrentTimeVideo')
    changeCurrentTimeVideo(client: Socket , data: {roomId: string , currentTime: number}) {
        this.currentTime = data.currentTime
        this.server.to(data.roomId).emit("changesCurrentTimeVideo" , {currentTime: data.currentTime})
    }

    @SubscribeMessage('playVideo')
    playVideo(client: Socket , data: {roomId: string}) {
        this.server.to(data.roomId).emit("allStart" , {})
    }

    @SubscribeMessage('pauseVideo')
    pauseVideo(client: Socket , data: {roomId: string}) {
        this.server.to(data.roomId).emit("allPause" , {})
    }

    @SubscribeMessage('sendMessage')
    handleMessage(client: Socket, message: any) {
        
        const room = message.room;
        const content = message.content;

        if(!this.historyMessages[room]) {
            this.historyMessages[room] = []
        }

        this.historyMessages[room].push(content)

        this.server.to(message.room).emit('roomMessage', { room: message.room, content: message.content });
    }

}