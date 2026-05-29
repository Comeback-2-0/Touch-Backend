const { Server } = require("socket.io");

function configureSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log("New user connected");

    socket.on("joinRoom", (communityId) => {
      socket.join(communityId);
    });

    socket.on(
      "sendMessage",
      ({ communityId, content, senderAnonymousId }) => {
        io.to(communityId).emit("newMessage", {
          content,
          senderAnonymousId,
          createdAt: new Date(),
        });
      }
    );

    socket.on("disconnect", () => {
      console.log("User disconnected");
    });
  });

  return io;
}

module.exports = configureSocketServer;
