# strimzi_kafka role

Installs Strimzi and deploys a single-node Kafka cluster for the local Block 2 stand.

Run from `infra/ansible` after the Minikube cluster is reachable:

```bash
ansible-playbook playbooks/strimzi-kafka.yml
```

The role intentionally uses `kubectl` commands instead of extra Ansible Kubernetes collections. That keeps the local requirement small: Ansible plus kubectl.
