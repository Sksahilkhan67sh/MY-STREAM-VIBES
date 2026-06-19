import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';

const router = Router();

// GET /api/merch/:creatorId
router.get('/:creatorId', async (req, res) => {
  try {
    const products = await prisma.merchProduct.findMany({
      where: { creatorId: req.params.creatorId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ products });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

const ProductSchema = z.object({
  creatorId: z.string(),
  title: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  imageUrl: z.string().url().optional(),
  price: z.number().int().min(0),
  currency: z.string().default('INR'),
  type: z.enum(['physical', 'digital']).default('physical'),
  stock: z.number().int().optional(),
  externalUrl: z.string().url().optional(),
});

// POST /api/merch
router.post('/', async (req, res) => {
  try {
    const data = ProductSchema.parse(req.body);
    const product = await prisma.merchProduct.create({ data: data as any });
    res.json(product);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// PATCH /api/merch/:id
router.patch('/:id', async (req, res) => {
  try {
    const data = ProductSchema.partial().parse(req.body);
    const updated = await prisma.merchProduct.update({ where: { id: req.params.id }, data: data as any });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// DELETE /api/merch/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.merchProduct.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ deactivated: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove product' });
  }
});

export default router;
