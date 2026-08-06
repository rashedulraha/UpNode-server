import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";

interface RequestValidationSchemas {
	body?: ZodSchema;
	params?: ZodSchema;
	query?: ZodSchema;
}

export const validateRequest = (schemas: RequestValidationSchemas) => {
	return async (
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> => {
		try {
			if (schemas.body) {
				req.body = await schemas.body.parseAsync(req.body);
			}
			if (schemas.params) {
				const parsedParams = (await schemas.params.parseAsync(
					req.params,
				)) as any;
				Object.assign(req.params, parsedParams);
			}
			if (schemas.query) {
				const parsedQuery = (await schemas.query.parseAsync(req.query)) as any;
				Object.assign(req.query, parsedQuery);
			}
			next();
		} catch (error) {
			if (error instanceof ZodError) {
				const formattedErrors = error.issues.map((err) => ({
					field: err.path.join("."),
					message: err.message,
				}));

				res.status(400).json({
					error: "Validation Error",
					details: formattedErrors,
				});
				return;
			}
			next(error);
		}
	};
};

export const validateBody = (schema: ZodSchema) =>
	validateRequest({ body: schema });
export const validateParams = (schema: ZodSchema) =>
	validateRequest({ params: schema });
export const validateQuery = (schema: ZodSchema) =>
	validateRequest({ query: schema });
