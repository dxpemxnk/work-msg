import { Fragment } from 'react';
import { Link, Typography } from '@mui/material';

import { messageTextParts } from '@utils/linkify';
import styles from './index.module.scss';

export function MessageBody({ body }: { body: string }) {
  return (
    <Typography component="div" className={styles.body!}>
      {messageTextParts(body).map((part, index) => (
        <Fragment key={`${part.kind}-${index}`}>
          {part.kind === 'link' ? (
            <Link
              href={part.href}
              target="_blank"
              rel="noopener noreferrer"
              underline="hover"
              className={styles.link!}
            >
              {part.value}
            </Link>
          ) : part.value}
        </Fragment>
      ))}
    </Typography>
  );
}
