import { useEffect, useEffectEvent } from 'react';
import { useSearchParams } from 'react-router-dom';

export function useConsumeSearchParams(apply: (params: URLSearchParams) => boolean) {
  const [searchParams, setSearchParams] = useSearchParams();

  const consume = useEffectEvent((params: URLSearchParams) => {
    if (apply(params)) setSearchParams({}, { replace: true });
  });

  useEffect(() => {
    consume(searchParams);
  }, [searchParams]);
}
