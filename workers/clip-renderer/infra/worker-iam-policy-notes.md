# IAM deployment notes

The CloudFormation template `clip-render-queue.yaml` now creates:

- Standard SQS render queue with server-side SQS encryption and a dead-letter queue.
- EC2 trust role and instance profile for the worker.
- Worker inline policy limited to:
  - S3 object read/write/delete under `media/*` in the existing bucket.
  - Receive/delete/change visibility/get attributes on only the render queue.
  - DynamoDB GetItem/UpdateItem on only the existing table, with `dynamodb:LeadingKeys` constrained to `CLIP#*`.
- A separate managed API publisher policy granting only `sqs:SendMessage` on the render queue.

CloudFormation requires `CAPABILITY_NAMED_IAM`.

## Attachments

1. Attach the returned EC2 instance profile to the existing worker EC2 instance, or choose it when launching a new instance.
2. Attach the returned API publisher policy to the IAM principal whose access key is already configured in the Next.js server environment. Do not retrieve, paste, or rotate the existing secret just to attach the policy.
3. If the existing Vercel API principal is not known, inspect the AWS credential owner in your own IAM account. Do not guess an IAM user from a key name.
4. If the S3 bucket uses SSE-KMS with a customer-managed key, add narrowly scoped kms:Decrypt, kms:Encrypt and kms:GenerateDataKey permissions for that exact key only after confirming the key ARN.

## Worker container identity

The Compose service uses host networking so the AWS SDK can use the EC2 instance profile through IMDSv2 without embedding credentials. Require IMDSv2 on the instance and do not set static AWS keys in `.env.worker`. The container is non-root, read-only except for a bounded temporary filesystem, drops Linux capabilities, and does not expose a listening port.

The worker needs temporary disk space for downloaded inputs, intermediates and final output. Compose mounts `/var/lib/zenigram-clip-renderer/tmp` from the host, so put this directory on an encrypted EBS volume, create it before starting Compose, and assign it to UID/GID 1000.
