import { ReactiveMap } from "@solid-primitives/map";
import { ReactiveSet } from "@solid-primitives/set";
import type { Interactions, Masquerade, Message } from "revolt-api";

import type { Client } from "../Client.js";
import { File } from "../classes/File.js";
import { MessageWebhook } from "../classes/Message.js";
import { MessageEmbed } from "../classes/MessageEmbed.js";
import { SystemMessage } from "../classes/SystemMessage.js";
import type { Merge } from "../lib/merge.js";

import type { Hydrate } from "./index.js";

export type HydratedMessage = {
  id: string;
  nonce?: string;
  channelId: string;
  authorId?: string;
  webhook?: MessageWebhook;
  content?: string;
  systemMessage?: SystemMessage;
  attachments?: File[];
  editedAt?: Date;
  embeds?: MessageEmbed[];
  mentionIds?: string[];
  replyIds?: string[];
  reactions: ReactiveMap<string, ReactiveSet<string>>;
  interactions?: Interactions;
  masquerade?: Masquerade;
  flags?: number;
};

export const messageHydration: Hydrate<Merge<Message>, HydratedMessage> = {
  keyMapping: {
    _id: "id",
    channel: "channelId",
    author: "authorId",
    system: "systemMessage",
    edited: "editedAt",
    mentions: "mentionIds",
    replies: "replyIds",
  },
  functions: {
    id: (message) => message._id,
    nonce: (message) => message.nonce!,
    channelId: (message) => message.channel,
    authorId: (message) => message.author,
    webhook: (message, ctx) =>
      message.webhook
        ? new MessageWebhook(ctx as Client, message.webhook, message.author)
        : undefined,
    content: (message) => message.content!,
    systemMessage: (message, ctx) =>
      SystemMessage.from(ctx as Client, message.system!),
    attachments: (message, ctx) =>
      message.attachments!.map((file) => new File(ctx as Client, file)),
    editedAt: (message) => new Date(message.edited!),
    embeds: (message, ctx) =>
      message.embeds!.map((embed) => MessageEmbed.from(ctx as Client, embed)),
    mentionIds: (message) => message.mentions!,
    replyIds: (message) => message.replies!,
    reactions: (message) => {
      const map = new ReactiveMap<string, ReactiveSet<string>>();
      if (message.reactions) {
        for (const reaction of Object.keys(message.reactions)) {
          map.set(reaction, new ReactiveSet(message.reactions![reaction]));
        }
      }
      return map;
    },
    interactions: (message) => message.interactions,
    masquerade: (message) => message.masquerade!,
    flags: (message) => message.flags!,
  },
  initialHydration: () => ({
    reactions: new ReactiveMap(),
  }),
};
