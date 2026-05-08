/** MockStore against the conformance harness. Also serves as a
 *  worked example for adding a new Store impl: copy this 5-line file,
 *  swap the factory. */
import { MockStore } from '../src/stores/mock'
import { runStoreConformance, CONFORMANCE_FIXTURE } from '../src/test/conformance'

runStoreConformance(() => MockStore(CONFORMANCE_FIXTURE, { pageSize: 3 }))
