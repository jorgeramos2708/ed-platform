import { ActorTipo } from '../db/auditoria.entity';

// Actor por defecto cuando la acción no proviene de un usuario autenticado
export const ActorSistema: { id: string; tipo: ActorTipo } = {
  id: 'sistema',
  tipo: ActorTipo.Sistema,
};
