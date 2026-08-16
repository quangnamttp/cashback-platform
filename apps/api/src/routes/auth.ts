import { Router } from 'express';
import { z } from 'zod';
import { registerUser, loginUser } from '../services/authService';

const router = Router();

router.post('/register', async (req, res) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(8),
      fullName: z.string().min(2),
    });

    const parsed = schema.parse(req.body);
    const result = await registerUser(parsed);
    return res.status(201).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Registration failed';
    return res.status(400).json({ error: message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(8),
    });

    const parsed = schema.parse(req.body);
    const result = await loginUser(parsed);
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Login failed';
    return res.status(401).json({ error: message });
  }
});

export default router;
