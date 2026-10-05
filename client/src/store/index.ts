import { configureStore } from '@reduxjs/toolkit';
import { type TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';

import { messengerApi } from '@services/api/messenger';

export const store = configureStore({
  reducer: { [messengerApi.reducerPath]: messengerApi.reducer },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(messengerApi.middleware),
});

export type AppDispatch = typeof store.dispatch;
export type RootState = ReturnType<typeof store.getState>;

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
