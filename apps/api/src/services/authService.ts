import { prisma } from '../lib/prisma';
import { hashPassword, signToken, verifyPassword } from '../lib/auth';

export async function registerUser(input: { email: string; password: string; fullName: string }) {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    throw new Error('Email already registered');
  }

  const user = await prisma.user.create({
    data: {
      email,
      fullName: input.fullName.trim(),
      passwordHash: hashPassword(input.password),
      role: 'USER',
    },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      createdAt: true,
    },
  });

  return {
    user,
    token: signToken({
      id: user.id,
      email: user.email,
      role: user.role === 'ADMIN' ? 'ADMIN' : 'USER',
    }),
  };
}

export async function loginUser(input: { email: string; password: string }) {
  const email = input.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !verifyPassword(input.password, user.passwordHash)) {
    throw new Error('Invalid credentials');
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role === 'ADMIN' ? 'ADMIN' : 'USER',
    },
    token: signToken({
      id: user.id,
      email: user.email,
      role: user.role === 'ADMIN' ? 'ADMIN' : 'USER',
    }),
  };
}
