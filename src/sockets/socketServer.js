const { Server } = require("socket.io");
const {configureSocketRedis} = require('./socketRedisAdapter');

async function configureSocketServer(httpServer, options = {}) {
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  await configureSocketRedis(io, options);

  io.on("connection", (socket) => {
    console.log("New user connected");

    socket.on("joinRoom", (communityId) => {
      socket.join(communityId);
    });

    const commentRoom = ({ communityId, contentId, commentId }) =>
      `community:${String(communityId)}:post:${String(contentId)}:comment:${String(commentId)}`;

    socket.on("joinCommunityPostThread", (payload = {}) => {
      if (!payload.communityId || !payload.contentId || !payload.commentId) return;
      socket.join(commentRoom(payload));
    });

    socket.on("leaveCommunityPostThread", (payload = {}) => {
      if (!payload.communityId || !payload.contentId || !payload.commentId) return;
      socket.leave(commentRoom(payload));
    });

    socket.on("communityReplyTyping", (payload = {}) => {
      if (!payload.communityId || !payload.contentId || !payload.commentId) return;
      socket.to(commentRoom(payload)).emit("communityReplyTyping", {
        contentId: String(payload.contentId),
        commentId: String(payload.commentId),
        isTyping: Boolean(payload.isTyping),
      });
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
