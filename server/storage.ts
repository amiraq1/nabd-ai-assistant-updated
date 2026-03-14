import {
  type User,
  type InsertUser,
  type Conversation,
  type InsertConversation,
  type Message,
  type InsertMessage,
  type Project,
  type InsertProject,
  type ProjectScreen,
  type InsertProjectScreen,
  users,
  conversations,
  messages,
  projects,
  projectScreens,
} from "../shared/schema.js";
import { db } from "./db.js";
import { eq, desc, and } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  ensureSessionUser(userId: string): Promise<User>;
  getConversations(userId: string): Promise<Conversation[]>;
  getConversation(id: string, userId: string): Promise<Conversation | undefined>;
  createConversation(conv: InsertConversation): Promise<Conversation>;
  deleteConversation(id: string, userId: string): Promise<boolean>;
  getMessages(conversationId: string, userId: string): Promise<Message[]>;
  createMessage(msg: InsertMessage): Promise<Message>;
  getProjectByName(userId: string, name: string): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  ensureProject(userId: string, name: string, platform: Project["platform"]): Promise<Project>;
  createProjectScreen(screen: InsertProjectScreen): Promise<ProjectScreen>;
  getLatestProjectScreen(projectId: string): Promise<ProjectScreen | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async ensureSessionUser(userId: string): Promise<User> {
    const existing = await this.getUser(userId);
    if (existing) {
      return existing;
    }

    const username = `session_${userId}`;
    const password = randomUUID();

    const [created] = await db
      .insert(users)
      .values({
        id: userId,
        username,
        password,
      })
      .onConflictDoNothing()
      .returning();

    if (created) {
      return created;
    }

    const fallback = await this.getUser(userId);
    if (fallback) {
      return fallback;
    }

    throw new Error("Failed to ensure a backing user row for the active session.");
  }

  async getConversations(userId: string): Promise<Conversation[]> {
    return db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.createdAt));
  }

  async getConversation(id: string, userId: string): Promise<Conversation | undefined> {
    const [conv] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.userId, userId)));
    return conv;
  }

  async createConversation(conv: InsertConversation): Promise<Conversation> {
    const [result] = await db.insert(conversations).values(conv).returning();
    return result;
  }

  async deleteConversation(id: string, userId: string): Promise<boolean> {
    const [deletedConversation] = await db
      .delete(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
      .returning({ id: conversations.id });
    return Boolean(deletedConversation);
  }

  async getMessages(conversationId: string, userId: string): Promise<Message[]> {
    const [conv] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(eq(conversations.id, conversationId), eq(conversations.userId, userId)),
      );
    if (!conv) return [];

    return db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt);
  }

  async createMessage(msg: InsertMessage): Promise<Message> {
    const [result] = await db.insert(messages).values(msg).returning();
    return result;
  }

  async getProjectByName(userId: string, name: string): Promise<Project | undefined> {
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.userId, userId), eq(projects.name, name)))
      .orderBy(desc(projects.createdAt));
    return project;
  }

  async createProject(project: InsertProject): Promise<Project> {
    const [result] = await db.insert(projects).values(project).returning();
    return result;
  }

  async ensureProject(
    userId: string,
    name: string,
    platform: Project["platform"],
  ): Promise<Project> {
    const existing = await this.getProjectByName(userId, name);
    if (existing) {
      return existing;
    }

    return this.createProject({ userId, name, platform });
  }

  async createProjectScreen(screen: InsertProjectScreen): Promise<ProjectScreen> {
    const [result] = await db.insert(projectScreens).values(screen).returning();
    return result;
  }

  async getLatestProjectScreen(projectId: string): Promise<ProjectScreen | undefined> {
    const [screen] = await db
      .select()
      .from(projectScreens)
      .where(eq(projectScreens.projectId, projectId))
      .orderBy(desc(projectScreens.updatedAt));
    return screen;
  }
}

export class MemStorage implements IStorage {
  private users: Map<string, User> = new Map();
  private conversations: Map<string, Conversation> = new Map();
  private messages: Map<string, Message> = new Map();
  private projects: Map<string, Project> = new Map();
  private projectScreens: Map<string, ProjectScreen> = new Map();

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async ensureSessionUser(userId: string): Promise<User> {
    const existing = this.users.get(userId);
    if (existing) {
      return existing;
    }

    const user: User = {
      id: userId,
      username: `session_${userId}`,
      password: randomUUID(),
    };
    this.users.set(userId, user);
    return user;
  }

  async getConversations(userId: string): Promise<Conversation[]> {
    return Array.from(this.conversations.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    ).filter(
      (conversation) => conversation.userId === userId,
    );
  }

  async getConversation(id: string, userId: string): Promise<Conversation | undefined> {
    const conversation = this.conversations.get(id);
    if (!conversation || conversation.userId !== userId) return undefined;
    return conversation;
  }

  async createConversation(conv: InsertConversation): Promise<Conversation> {
    const id = randomUUID();
    const conversation: Conversation = {
      ...conv,
      id,
      createdAt: new Date(),
    };
    this.conversations.set(id, conversation);
    return conversation;
  }

  async deleteConversation(id: string, userId: string): Promise<boolean> {
    const conversation = await this.getConversation(id, userId);
    if (!conversation) return false;

    this.conversations.delete(id);
    for (const [msgId, msg] of Array.from(this.messages.entries())) {
      if (msg.conversationId === id) {
        this.messages.delete(msgId);
      }
    }
    return true;
  }

  async getMessages(conversationId: string, userId: string): Promise<Message[]> {
    const conversation = await this.getConversation(conversationId, userId);
    if (!conversation) return [];

    return Array.from(this.messages.values())
      .filter((msg) => msg.conversationId === conversationId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async createMessage(msg: InsertMessage): Promise<Message> {
    const id = randomUUID();
    const message: Message = {
      ...msg,
      id,
      createdAt: new Date(),
    };
    this.messages.set(id, message);
    return message;
  }

  async getProjectByName(userId: string, name: string): Promise<Project | undefined> {
    return Array.from(this.projects.values())
      .filter((project) => project.userId === userId && project.name === name)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  }

  async createProject(project: InsertProject): Promise<Project> {
    const id = randomUUID();
    const createdProject: Project = {
      ...project,
      id,
      createdAt: new Date(),
    };
    this.projects.set(id, createdProject);
    return createdProject;
  }

  async ensureProject(
    userId: string,
    name: string,
    platform: Project["platform"],
  ): Promise<Project> {
    const existing = await this.getProjectByName(userId, name);
    if (existing) {
      return existing;
    }

    return this.createProject({ userId, name, platform });
  }

  async createProjectScreen(screen: InsertProjectScreen): Promise<ProjectScreen> {
    const id = randomUUID();
    const createdScreen: ProjectScreen = {
      ...screen,
      id,
      reactCode: screen.reactCode ?? "",
      updatedAt: new Date(),
    };
    this.projectScreens.set(id, createdScreen);
    return createdScreen;
  }

  async getLatestProjectScreen(projectId: string): Promise<ProjectScreen | undefined> {
    return Array.from(this.projectScreens.values())
      .filter((screen) => screen.projectId === projectId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
  }
}

export const storage = process.env.DATABASE_URL
  ? new DatabaseStorage()
  : new MemStorage();
