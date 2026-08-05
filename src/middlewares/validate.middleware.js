import { ZodError } from "zod";
export const validateRequest = (schemas) => {
    return async (req, res, next) => {
        try {
            if (schemas.body) {
                req.body = await schemas.body.parseAsync(req.body);
            }
            if (schemas.params) {
                const parsedParams = (await schemas.params.parseAsync(req.params));
                Object.assign(req.params, parsedParams);
            }
            if (schemas.query) {
                const parsedQuery = (await schemas.query.parseAsync(req.query));
                Object.assign(req.query, parsedQuery);
            }
            next();
        }
        catch (error) {
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
export const validateBody = (schema) => validateRequest({ body: schema });
export const validateParams = (schema) => validateRequest({ params: schema });
export const validateQuery = (schema) => validateRequest({ query: schema });
