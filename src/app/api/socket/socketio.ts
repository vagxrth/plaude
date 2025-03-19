import { Server as NetServer } from "http";
import { NextApiRequest, NextApiResponse } from "next";
import { Server as ServerIO } from "socket.io";

export type NextApiResponseServerIO = NextApiResponse & {
  socket: {
    server: NetServer & {
      io: ServerIO;
    };
  };
};

export type NextApiRequestWithSocket = NextApiRequest & {
  socket: {
    server: NetServer & {
      io: ServerIO;
    };
  };
};
