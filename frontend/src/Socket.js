class Socket {
    constructor(endpoint, onOpen, onMessage, onClose, onError) {
        this.socket = new WebSocket(endpoint)
        this.opened = false

        this.socket.onopen = () => {
            this.opened = true
            console.log("Socket opened")
            onOpen()
        }

        this.socket.onmessage = message => {
            onMessage(message.data)
        }

        this.socket.onclose = event => {
            console.log("Socket closed", event)
            onClose(event)
        }

        this.socket.onerror = error => {
            console.log("Socket error", error)
            onError(error)
        }
    }

    isOpen = () => {
        return this.opened
    }

    close = () => {
        if (this.opened) {
            console.log("Socket closing")
            this.socket.close()
        }
    }

    sendMessage = message => {
        if (this.opened)
        {
            this.socket.send(message)
        }
    }
}

export { Socket }